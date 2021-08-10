

import { MongoClient, MongoClientOptions, Db } from 'mongodb';
import { AsyncService } from 'tskit';



export class MongoDB extends AsyncService {
    client: MongoClient;
    db!: Db;

    constructor(public url: string, public options?: MongoClientOptions) {
        super();

        this.client = new MongoClient(url, options);

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
                this.emit('ready', this.client)
            });

            return this.client;
        } catch (err) {
            this.emit('error', err);

            throw err;
        }
    }

}
