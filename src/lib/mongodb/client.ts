

import { Config } from 'config';
import { MongoClient, MongoClientOptions, Db } from 'mongodb';
import { AsyncService } from 'tskit';

import { singleton } from 'tsyringe';
@singleton()
export class MongoDB extends AsyncService {
    client: MongoClient;
    db!: Db;
    url: string;
    options?: MongoClientOptions;
    constructor(config: Config) {
        super();

        this.url = config.mongoUrl;
        this.options = config.mongoOptions;

        this.client = new MongoClient(this.url, this.options);

        this.client.on('error', (err) => {
            this.emit('error', err);
        });

        this.on('error', (err) => {
            this.emit('revoked', err);
        });

        this.init();
    }

    async init() {
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
