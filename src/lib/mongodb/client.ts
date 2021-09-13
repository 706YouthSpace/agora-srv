

import { MongoClient, MongoClientOptions, Db } from 'mongodb';
import { AsyncService } from '@naiverlabs/tskit';

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

        this.init().then(() => this.emit('ready'));
    }

    createClient() {
        return new MongoClient(this.url, this.options);
    }

    async init() {
        await this.dependencyReady();

        this.client = this.createClient();
        this.db = this.client.db();

        this.client.on('error', (err) => {
            this.emit('error', err);
        });

        try {
            await this.client.connect();
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
