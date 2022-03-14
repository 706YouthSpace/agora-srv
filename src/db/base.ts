import _ from "lodash";
import { ObjectId, Document, MongoClientOptions, ClientSession } from "mongodb";
import { singleton, container } from 'tsyringe';
import { AbstractMongoCollection, AbstractMongoDB } from '@naiverlabs/tskit';

import { InjectProperty } from "../services/property-injector";
import { Config } from '../config';
import globalLogger from '../services/logger';

@singleton()
export class MongoDB extends AbstractMongoDB {
    options?: MongoClientOptions;
    url: string;

    constructor(config: Config) {
        super(...arguments);
        this.options = config.mongoOptions;
        this.url = config.mongoUrl;
        this.init().catch((err) => this.emit('error', err));
    }

    override async init() {

        await super.init();

        this.emit('ready');
    }

}

export abstract class MongoCollection<T extends Document, P = ObjectId> extends AbstractMongoCollection<T, P> {

    @InjectProperty()
    mongo!: MongoDB;

    logger = globalLogger.child({ service: this.constructor.name });

    typeclass: any = undefined;

    override async init() {
        await super.init();

        this.emit('ready');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async createIndexes(_options?: { session?: ClientSession; }) {
        this.logger.warn(`CreateIndexes for ${this.constructor.name}(${this.collectionName}) is not implemented`);
    }

    async ensureCollection(options?: { session?: ClientSession; }) {
        this.logger.info(`Ensuring collection ${this.constructor.name}(${this.collectionName})...`);
        const r = await this.mongo.db.listCollections(
            { name: this.collectionName },
            { nameOnly: true, session: options?.session }
        ).toArray();

        if (r.length) {
            this.logger.info(`Looks like collection ${this.constructor.name}(${this.collectionName}) already exists`);
            return;
        }

        if (r.length <= 0) {
            this.logger.warn(`Creating collection ${this.constructor.name}(${this.collectionName})...`);
            await this.mongo.db.createCollection(this.collectionName);

            this.logger.info(`Collection created: ${this.constructor.name}(${this.collectionName})`);
        }
    }

}

export const mongoClient = container.resolve(MongoDB);

export default mongoClient;
