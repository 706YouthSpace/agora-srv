import { Collection } from "mongodb";
import { AsyncService } from "tskit";
import { MongoDB } from "./client";


export abstract class MongoHandle<T> extends AsyncService {

    abstract collection: Collection<T>;

    constructor(protected mongo: MongoDB) {
        super(mongo);
        mongo.on('revoked', () => this.emit('revoked'));

        this.init();
    }

    init() {
        this.dependencyReady.then(() => this.emit('ready'));
    }
}
