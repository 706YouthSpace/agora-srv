import { ObjectId } from "mongodb";
import { MongoCollection } from '../lib/mongodb/client';
import _ from 'lodash';
import { ApplicationError } from '../lib/errors';
import { vectorize } from '../lib/simple-tools';

export interface FileRecord {
    _id: ObjectId;

    owner: ObjectId;
    ownerType: string;

    sha256SumHex: string;

    name: string;

    mimeType?: string;
    size?: number;

    properties?: {
        [k: string]: any;
    }

    createdAt: number;
    updatedAt: number;

    blocked?: boolean;
}

export class FileMongoOperations extends MongoCollection<FileRecord> {

    newRecord(ownerId: ObjectId, ownerType: string, sha256SumHex: string, name: string, mimeType?: string, size?: number, properties?: object) {

        if (!(ownerId && ownerType && sha256SumHex && name)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }
        const ts = Date.now();

        return this.insertOne({
            owner: ownerId,
            ownerType,

            sha256SumHex,
            name,

            mimeType,
            size,

            properties,

            createdAt: ts,
            updatedAt: ts
        });
    }

    upsertRecord(ownerId: ObjectId, ownerType: string, sha256SumHex: string, name: string, mimeType?: string, size?: number, properties?: object) {

        if (!(ownerId && ownerType && sha256SumHex && name)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        const ts = Date.now();

        return this.findOneAndUpdate(
            {
                owner: ownerId,
                ownerType,

                sha256SumHex,
                name
            },
            {
                $set: _.isEmpty(properties) ?
                    { mimeType, size, properties, updatedAt: ts } : vectorize({ mimeType, size, properties, updatedAt: ts }),
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

    removeRecordById(recordId: ObjectId | string) {

        if (!(recordId)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        return this.deleteOne({ _id: new ObjectId(recordId) });
    }


}
