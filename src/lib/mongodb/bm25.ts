import _ from 'lodash';
import { Collection, Filter, ObjectId } from 'mongodb';
import { jiebaService } from '../../services/nlp';
import { MongoHandle } from './collection';

export interface TFIDFFacl {
    _id: ObjectId;
    _terms: Array<{
        t: string;
        tf: number;
    }>;
}

export interface TextAnalyzable<T extends object> {
    termAnalyze(record: Partial<T>): Promise<{ [term: string]: number }>;
    queryAnalyze(queryString: string): Promise<string[]>;
}
export abstract class MongoBM25Handle<T extends object> extends MongoHandle<T & TFIDFFacl> {

    totalCount?: number;
    avgdl?: number;

    abstract collection: Collection<T & TFIDFFacl>;

    abstract termAnalyze(record: Partial<T>): Promise<{ [term: string]: number }>;
    abstract queryAnalyze(queryString: string): Promise<string[]>;

    async tfFill(record: Partial<T> & Partial<TFIDFFacl>) {
        const termObj = await this.termAnalyze(record);

        if (!Array.isArray(record._terms)) {
            record._terms = [];
        }

        const termIndex = _.keyBy(record._terms, 't');

        for (const [k, v] of Object.entries(termObj)) {
            if (termIndex[k]) {
                termIndex[k].tf = v;
                continue;
            }
            const newRecord = { t: k, tf: v };
            record._terms.push(newRecord);
            termIndex[k] = newRecord;
        }

        return record;
    }

    async _queryTotalCount(query?: Filter<T>) {

        // const result = await this.countDocuments({ _terms: { $exists: true } });

        const result = await (query ? this.collection.countDocuments(query as any) : this.collection.estimatedDocumentCount());

        return result;
    }

    async _queryAvgdl() {

        // const result = await this.countDocuments({ _terms: { $exists: true } });

        const result = await this.collection.aggregate([
            { $match: { _terms: { $exists: true } } },
            {
                $group: {
                    _id: null,
                    avgdl: {
                        $avg: {
                            $reduce: {
                                input: '$_terms',
                                initialValue: 0,
                                in: {
                                    $add: ["$$value", '$$this.tf']
                                }
                            }
                        }
                    }
                }
            }
        ]).toArray();

        if (result && result[0]) {
            const avgdl = (result[0] as any).avgdl;
            if (!avgdl) {
                throw new Error('Error finding avgdl');
            }
            this.avgdl = avgdl;
        }

        return result;
    }

    async tfIndex(record: Partial<T> & Partial<TFIDFFacl>) {
        if (!record._id) {
            return null;
        }

        const termObj = await this.termAnalyze(record);
        const terms = [];
        for (const [k, v] of Object.entries(termObj)) {
            const newRecord = { t: k, tf: v };
            terms.push(newRecord);
        }

        return this.collection.updateOne({ _id: record._id as any } as T & TFIDFFacl, {
            $set: {
                _terms: terms
            } as T & TFIDFFacl
        });
    }

    async tfReIndex(id: ObjectId) {
        const record: T & TFIDFFacl | undefined = await this.collection.findOne({ _id: id as any }) as T & TFIDFFacl;
        if (!record) {
            return null;
        }

        return this.tfIndex(record);
    }

    async bm25Aggregate(queryString: string, additionalQuery?: Filter<T>, limit = 1000, skip = 0) {

        const queryTerms = await this.queryAnalyze(queryString);

        if (!queryTerms.length) {
            return null;
        }

        if (!this.totalCount) {
            await this._queryTotalCount();
            if (!this.totalCount) {
                return null;
            }
        }

        if (!this.avgdl) {
            await this._queryAvgdl();
            if (!this.avgdl) {
                return null;
            }
        }

        const docCount = this.totalCount;

        const idfs = queryTerms.map(async (x: string) => {
            const n = await this.collection.countDocuments({ '_terms.t': x } as object);

            // tslint:disable-next-line: no-magic-numbers
            return Math.log10((docCount - n + 0.5) / (n + 0.5));
        });

        const idfVec = _.zip(queryTerms, await Promise.all(idfs)).map(([k, v]) => {
            return { k, v };
        });
        const k1 = 1.5;
        const b = 0.75;
        const theta = 1;
        const avgdl = this.avgdl;
        const result = await this.collection.aggregate<{ _id: ObjectId; score: number }>(
            [
                {
                    $match: {
                        ...(additionalQuery || {}),
                        '_terms.t': { $in: queryTerms }
                    }
                },
                {
                    $addFields: {
                        dl: {
                            $reduce: {
                                input: '$_terms',
                                initialValue: 0,
                                in: {
                                    $add: ["$$value", '$$this.tf']
                                }
                            }
                        }
                    }
                },
                {
                    $unwind: '$_terms'
                },
                {
                    $match: {
                        '_terms.t': { $in: queryTerms }
                    }
                },
                {
                    $addFields: {
                        idf: {
                            $let: {
                                vars: {
                                    idfs: idfVec
                                },
                                in: {
                                    $setDifference: [
                                        {
                                            $map: {
                                                input: "$$idfs",
                                                as: "idfVec",
                                                in: {
                                                    $cond: [
                                                        { $eq: ["$$idfVec.k", "$_terms.t"] },
                                                        "$$idfVec.v",
                                                        false
                                                    ]
                                                }
                                            }
                                        },
                                        [false]
                                    ]
                                }
                            }
                        }
                    }
                },
                {
                    $unwind: '$idf'
                },
                {
                    $addFields: {
                        bm25: {
                            $multiply: [
                                '$idf', {
                                    $sum: [
                                        theta,
                                        {
                                            $divide: [
                                                {
                                                    $multiply: [
                                                        '$_terms.tf',
                                                        k1 + 1
                                                    ]
                                                },
                                                {
                                                    $sum: [
                                                        '$_terms.tf',
                                                        {
                                                            $multiply: [
                                                                k1,
                                                                {
                                                                    $sum: [
                                                                        1 - b,
                                                                        {
                                                                            $multiply: [
                                                                                b,
                                                                                {
                                                                                    $divide: [
                                                                                        '$dl',
                                                                                        avgdl
                                                                                    ]
                                                                                }
                                                                            ]
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: '$_id',
                        score: { $sum: '$bm25' }
                    }
                },
                { $sort: { score: -1 } },
                { $skip: skip },
                { $limit: limit }
            ],
            {
                allowDiskUse: true
            }
        ).toArray();

        return result;
    }
}

export abstract class MongoJiebaBM25Toolkit<T extends object> extends MongoBM25Handle<T> {
    async queryAnalyze(queryString: string) {
        const result = jiebaService.analyze(queryString.toLowerCase());

        return Promise.resolve(Object.keys(result));
    }

    async indexAnalyze(content: string) {
        const result = jiebaService.analyzeForIndex(content.toLowerCase());

        return Promise.resolve(result);
    }
}
