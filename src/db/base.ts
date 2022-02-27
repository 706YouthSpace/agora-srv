import _ from "lodash";
import { ObjectId, Document, MongoClientOptions } from "mongodb";
import { singleton, container } from 'tsyringe';
import { AbstractMongoCollection, AbstractMongoDB } from '@naiverlabs/tskit';

import { InjectProperty } from "../services/property-injector";
import { Config } from '../config';

export abstract class MongoCollection<T extends Document, P = ObjectId> extends AbstractMongoCollection<T, P> {

    @InjectProperty()
    mongo!: MongoDB;

    typeclass: any = undefined;

}

@singleton()
export class MongoDB extends AbstractMongoDB {
    options?: MongoClientOptions;
    url: string;

    constructor(config: Config) {
        super(...arguments);
        this.options = config.mongoOptions;
        this.url = config.mongoUrl;
    }
}

export const mongoClient = container.resolve(MongoDB);

export default mongoClient;
