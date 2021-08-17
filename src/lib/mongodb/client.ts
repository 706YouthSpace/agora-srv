

import { MongoClient, MongoClientOptions, Db } from 'mongodb';
import { AsyncService } from 'tskit';

export abstract class AbstractMongoDB extends AsyncService {
    client!: MongoClient;
    db!: Db;
    abstract url: string;
    abstract options?: MongoClientOptions;
    constructor(...whatever: any[]) {
        super(...whatever);

        this.on('error', (err) => {
            this.emit('revoked', err);
        });

        this.init();
    }

    createClient() {
        return new MongoClient(this.url, this.options);
    }

    async init() {
        await this.dependencyReady();

        this.client = this.createClient();

        this.client.on('error', (err) => {
            this.emit('error', err);
        });

        try {
            await this.client.connect();
            this.db = this.client.db();
            setImmediate(() => {
                this.emit('ready', this.client);
            });

            return this.client;
        } catch (err) {
            this.emit('error', err);

            throw err;
        }
    }

}
