import { AbstractMongoDB } from '../lib/mongodb';
import { Config } from '../config';

import { singleton, container } from 'tsyringe';
import { MongoClientOptions } from 'mongodb';


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
