import { Collection } from "mongodb";
import { AsyncService } from "tskit";
import { AbstractMongoDB } from "./client";


export abstract class MongoHandle<T> extends AsyncService {

    abstract collection: Collection<T>;
    abstract typeclass?: { new(): T };

    constructor(protected mongo: AbstractMongoDB) {
        super(mongo);
        mongo.on('revoked', () => this.emit('revoked'));

        this.init();
    }

    init() {
        this.dependencyReady().then(() => this.emit('ready'));
    }
}
