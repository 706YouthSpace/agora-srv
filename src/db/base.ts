import { Session } from "inspector";
import { MongoHandle } from "../lib/mongodb/collection";
import { vectorize } from "../lib/simple-tools";
import _ from "lodash";
import { ObjectId, Document } from "mongodb";
import { deepCreate } from "tskit";
import { MongoDB } from "./client";
import { InjectProperty } from "../lib/property-injector";

export abstract class MongoCollection<T extends Document, P = ObjectId> extends MongoHandle<T> {

    @InjectProperty()
    mongo!: MongoDB;
    typeclass: undefined;

    async get(_id: P) {
        const r = await this.collection.findOne({ _id });

        if (!r) {
            return r;
        }

        return deepCreate(r);
    }


    set(_id: P, data: Partial<Session>) {
        const now = new Date();

        return this.collection.findOneAndUpdate(
            { _id },
            { $set: vectorize({ ...data, updatedAt: now }), $setOnInsert: { createdAt: now } } as any,
            { upsert: true });
    }

    save(data: Partial<Session> & { _id: P }) {
        return this.set(data._id, _.omit(data, '_id'))
    }

    clear(_id: P) {
        return this.collection.deleteOne({ _id });
    }

}