import { Collection } from "mongodb";
import { AsyncService } from "@naiverlabs/tskit";
import { AbstractMongoDB } from "./client";


export abstract class MongoHandle<T> extends AsyncService {


    abstract collectionName: string;
    abstract mongo: AbstractMongoDB;
    collection!: Collection<T>;
    abstract typeclass?: { new(): T };

    constructor(...whatever: any[]) {
        super(...whatever);


        if ((this as any).mongo && !this.__dependencies.includes((this as any).mongo)) {
            this.__dependencies.push((this as any).mongo);
        }

        setImmediate(() => this.init().then(() => this.emit('ready')));
    }

    async init() {
        this.mongo.on('revoked', () => this.emit('revoked'));
        await this.dependencyReady();
        this.collection = this.mongo.db.collection(this.collectionName);
    }
}
