import { MongoClient, MongoClientOptions } from 'mongodb';

import { EventEmitter } from 'events';

export abstract class DatabaseClient<T> extends EventEmitter {
    protected opQueue: object[] = [];
    avaliable: Boolean = false;
    protected abstract init(options: object): any;
    abstract get client(): T | Promise<T>;
}

export class MongodbClient extends DatabaseClient<MongoClient> {
    mongoUrl: string;
    options: MongoClientOptions;
    protected mongoClient: MongoClient;
    mongoClientPromise: Promise<MongoClient>;

    constructor(url: string, options: MongoClientOptions = {}) {
        super();
        this.options = options;
        this.mongoUrl = url;
        this.mongoClient = new MongoClient(this.mongoUrl, this.options);
        this.avaliable = true;

        this.mongoClientPromise = this.init();
    }

    init() {
        this.mongoClientPromise = this.mongoClient.connect().then((client) => {
            const reInitFunc = (_err: any) => {
                if (!client.isConnected()) {
                    client.close().catch();

                    this.mongoClient.removeListener('error', reInitFunc);
                    // tslint:disable-next-line: no-floating-promises
                    this.init();
                }
            };
            this.mongoClient.on('error', reInitFunc);

            return client;
        });

        return this.mongoClientPromise;
    }

    get client() {
        if (this.mongoClient && this.mongoClient.isConnected) {
            return this.mongoClient;
        }

        return this.mongoClientPromise;
    }
}
