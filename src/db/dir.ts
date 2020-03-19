import { ObjectId } from "mongodb";
import { MongoCollection } from '../lib/mongodb/client';
import _ from 'lodash';
import { ApplicationError } from '../lib/errors';
import { vectorize } from '../lib/simple-tools';

export interface DirRecord {
    _id: ObjectId;

    owner: ObjectId;
    ownerType: string;

    name: string;

    properties?: {
        [k: string]: any;
    }

    createdAt: number;
    updatedAt: number;
}

export class DirMongoOperations extends MongoCollection<DirRecord> {

    newRecord(ownerId: ObjectId, ownerType: string, name: string, properties?: object) {

        if (!(ownerId && ownerType && name)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }
        const ts = Date.now();

        return this.insertOne({
            owner: ownerId,
            ownerType,

            name,

            properties,

            createdAt: ts,
            updatedAt: ts
        });
    }

    upsertRecord(ownerId: ObjectId, ownerType: string, name: string, properties?: object) {

        if (!(ownerId && ownerType && name)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        const ts = Date.now();

        return this.findOneAndUpdate(
            {
                owner: ownerId,
                ownerType,
                name
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

    removeRecordById(recordId: ObjectId | string) {

        if (!(recordId)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        return this.deleteOne({ _id: new ObjectId(recordId) });
    }


}
