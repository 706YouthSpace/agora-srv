import _ from "lodash";
import { ObjectId, Document, MongoClientOptions } from "mongodb";
import { singleton, container } from 'tsyringe';
import { AbstractMongoCollection, AbstractMongoDB } from '@naiverlabs/tskit';

import { InjectProperty } from "../services/property-injector";
import { Config } from '../config';

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

    typeclass: any = undefined;

    override async init() {
        await super.init();

        this.emit('ready');
    }

}

export const mongoClient = container.resolve(MongoDB);

export default mongoClient;
