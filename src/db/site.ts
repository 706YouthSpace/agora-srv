import _ from 'lodash';
import { Collection, ObjectId } from "mongodb";
import { deepCreate, vectorize } from "tskit";
import { MongoHandle } from "../lib/mongodb/collection";
import { MongoDB } from "./client";
import { singleton, container } from 'tsyringe';

export interface Site {
    _id: ObjectId;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoSites extends MongoHandle<Site> {
    collection: Collection<Site>;
    typeclass: undefined;

    constructor(db: MongoDB) {
        super(db);

        this.collection = this.mongo.db.collection<Site>('sites');
    }


    async get(_id: ObjectId) {
        const r = this.collection.findOne({ _id });

        if (!r) {
            return r;
        }

        return deepCreate(r);
    }


    set(_id: ObjectId, data: Partial<Site>) {
        const now = new Date();

        return this.collection.findOneAndUpdate({ _id }, { $set: vectorize({ ...data, updatedAt: now }), $setOnInsert: { createdAt: now } }, { upsert: true });
    }

    save(data: Partial<Site> & { _id: ObjectId }) {
        return this.set(data._id, _.omit(data, '_id'))
    }

    clear(_id: ObjectId) {
        return this.collection.deleteOne({ _id });
    }

}


export const mongoSession = container.resolve(MongoSession);
