import _ from 'lodash';
import { Collection, ObjectId } from "mongodb";
import { deepCreate, vectorize } from "tskit";
import { MongoHandle } from "../lib/mongodb/collection";
import { MongoDB } from "./client";
import { singleton, container } from 'tsyringe';

export interface Config {
    _id: ObjectId;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoConfig extends MongoHandle<Config> {
    collection!: Collection<Config>;
    typeclass: undefined;

    constructor(db: MongoDB) {
        super(db);
    }

    async init() {
        await this.dependencyReady();
        this.collection = this.mongo.db.collection<Config>('configs');
        this.emit('ready');
    }


    async get(_id: ObjectId) {
        const r = await this.collection.findOne({ _id });

        if (!r) {
            return r;
        }

        return deepCreate(r);
    }


    set(_id: ObjectId, data: Partial<Config>) {
        const now = new Date();

        return this.collection.findOneAndUpdate({ _id }, { $set: vectorize({ ...data, updatedAt: now }), $setOnInsert: { createdAt: now } }, { upsert: true });
    }

    save(data: Partial<Config> & { _id: ObjectId }) {
        return this.set(data._id, _.omit(data, '_id'))
    }

    clear(_id: ObjectId) {
        return this.collection.deleteOne({ _id });
    }
}


export const mongoConfig = container.resolve(MongoConfig);
