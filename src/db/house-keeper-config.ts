import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { MongoConfig } from './config';
import { Config } from '../config';


@singleton()
export class HouseKeeperMongoConfig extends MongoConfig {
    confMap: Map<string, { [k: string]: any }> = new Map();

    subscriptionKeys: string[];

    constructor(protected config: Config) {
        super(...arguments);
        const wxConfig = config.wechat;
        this.subscriptionKeys = [`wxa.${wxConfig.appId}`];
    }
}


export const houseKeeperMongoConfig = container.resolve(MongoConfig);
