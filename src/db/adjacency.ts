import { ObjectId } from "mongodb";
import { MongoCollection } from '../lib/mongodb/client';
import _ from 'lodash';
import { ApplicationError } from '../lib/errors';
import { vectorize } from '../lib/simple-tools';

export interface AdjacencyRecord {
    _id: ObjectId;

    from: ObjectId;
    fromType: string;

    to: ObjectId;
    toType: string;

    type: string;

    properties?: {
        [k: string]: any;
    }

    createdAt: number;
    updatedAt: number;
}

export class AdjacencyMongoOperations extends MongoCollection<AdjacencyRecord> {

    newRecord(fromId: ObjectId, fromType: string, toId: ObjectId, toType: string, relationType: string, properties?: object) {

        if (!(fromId && fromType && toId && toType && relationType)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }
        const ts = Date.now();

        return this.insertOne({
            from: fromId,
            fromType,

            to: toId,
            toType,

            type: relationType,

            properties,

            createdAt: ts,
            updatedAt: ts
        });
    }

    upsertRecord(fromId: ObjectId, fromType: string, toId: ObjectId, toType: string, relationType: string, properties?: object) {

        if (!(fromId && fromType && toId && toType && relationType)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        const ts = Date.now();

        return this.findOneAndUpdate(
            {
                from: fromId,
                fromType,

                to: toId,
                toType,

                type: relationType,
            },
            {
                $set: _.isEmpty(properties) ? { properties, updatedAt: ts } : vectorize({ properties, updatedAt: ts }),
                $setOnInsert: {
                    createdAt: ts
                }
            },
            {
                upsert: true,
                returnOriginal: false
            }
        );
    }

    upsertRecordById(id: ObjectId, recordToSet: AdjacencyRecord) {

        if (!(id && recordToSet)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        return this.findOneAndUpdate(
            {
                _id: id
            },
            {
                $set: vectorize(recordToSet)
            },
            {
                returnOriginal: false
            }
        );
    }

    removeRecords(fromId: ObjectId, fromType: string, toId: ObjectId, toType: string, relationType: string, properties?: object) {

        if (!(fromId && fromType && toId && toType && relationType)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        const query = {
            from: fromId,
            fromType,

            to: toId,
            toType,

            type: relationType,
        };

        return this.deleteMany(
            properties ? { ...query, ...vectorize({ properties }) } : query
        );
    }

    removeRecordById(relationId: ObjectId | string) {

        if (!(relationId)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        return this.deleteOne({ _id: new ObjectId(relationId) });
    }


}
