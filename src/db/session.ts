import _ from 'lodash';
import { ObjectId } from "mongodb";
import { deepCreate, vectorize } from "tskit";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface Session {
    _id: ObjectId;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoSession extends MongoCollection<Session> {
    collectionName = 'sessions';

    async get(_id: ObjectId) {
        const r = await this.collection.findOne({ _id });

        if (!r) {
            return r;
        }

        return deepCreate(r);
    }


    set(_id: ObjectId, data: Partial<Session>) {
        const now = new Date();

        return this.collection.findOneAndUpdate({ _id }, { $set: vectorize({ ...data, updatedAt: now }), $setOnInsert: { createdAt: now } }, { upsert: true });
    }

    save(data: Partial<Session> & { _id: ObjectId }) {
        return this.set(data._id, _.omit(data, '_id'))
    }

    clear(_id: ObjectId) {
        return this.collection.deleteOne({ _id });
    }

}


export const mongoSession = container.resolve(MongoSession);
