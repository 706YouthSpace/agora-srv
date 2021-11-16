import { MongoHandle } from "../lib/mongodb/collection";
import _ from "lodash";
import { ObjectId, Document } from "mongodb";
import { deepCreate, vectorize } from "@naiverlabs/tskit";
import { MongoDB } from "./client";
import { InjectProperty } from "../lib/property-injector";

export abstract class MongoCollection<T extends Document, P = ObjectId> extends MongoHandle<T> {

    @InjectProperty()
    mongo!: MongoDB;

    typeclass: undefined;

    async getForModifaction(_id: P) {
        const r = await this.get(_id);

        if (!r) {
            return r;
        }

        return deepCreate(r);
    }

    async get(_id: P) {
        const r = await this.collection.findOne({ _id });

        return r;
    }

    async getAll() {
        const r = await this.collection.find({});

        return r;
    }

    async create(data: Partial<T>) {
        const now = new Date();
        const doc: any = { ...data, createdAt: now, updatedAt: now };
        const r = await this.collection.insertOne(doc);

        doc._id = r.insertedId;

        return r as any as T;
    }


    set(_id: P, data: Partial<T>) {
        const now = new Date();
        return this.collection.findOneAndUpdate(
            { _id },
            { $set: vectorize({ ...data, updatedAt: now }), $setOnInsert: { createdAt: now } } as any,
            { upsert: true }
        );
    }

    save(data: Partial<T> & { _id: P }) {
        return this.set(data._id, _.omit(data, '_id') as any)
    }

    clear(_id: P) {
        return this.collection.deleteOne({ _id });
    }

    del(_id: P) {
        return this.collection.deleteOne({ _id });
    }

}