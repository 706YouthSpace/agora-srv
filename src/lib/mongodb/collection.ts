import { Collection } from "mongodb";
import { AbstractMongoCollection, AbstractMongoDB } from "@naiverlabs/tskit";


export abstract class MongoHandle<T extends object> extends AbstractMongoCollection<T> {


    abstract collectionName: string;
    abstract mongo: AbstractMongoDB;
    collection!: Collection<T>;
    abstract typeclass?: { new(): T };

    constructor(...whatever: any[]) {
        super(...whatever);


        if ((this as any).mongo && !this.__dependencies.has((this as any).mongo)) {
            this.__dependencies.add((this as any).mongo);
        }

        setImmediate(() => this.init().then(() => this.emit('ready')));
    }

    async init() {
        this.mongo.on('revoked', () => this.emit('revoked'));
        await this.dependencyReady();
        this.collection = this.mongo.db.collection(this.collectionName);
    }
}
