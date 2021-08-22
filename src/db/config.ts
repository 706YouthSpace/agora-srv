import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface Config {
    _id: string;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoConfig extends MongoCollection<Config, string> {
    collectionName = 'configs';

    confMap: Map<string, { [k: string]: any }> = new Map();

    subscriptionKeys?: string[];

    async init() {
        await super.init();

        const subscription = await this.catchUp(...(this.subscriptionKeys || []));

        subscription.on('error', () => this.emit('revoked'));

        this.emit('ready');
    }

    localGet(_id: string) {
        return this.confMap.get(_id);
    }


    subscribe(...keys: string[]) {
        const eventTypes = ['insert', 'update', 'delete', 'invalidate'];
        const matchQuery: any = {
            operationType: { $in: eventTypes }
        };
        if (keys.length) {
            eventTypes.shift();
            matchQuery['docutmentKey._id'] = { $in: keys };

        }

        const changeStream = this.collection.watch([{ $match: matchQuery }], { fullDocument: 'updateLookup' });

        changeStream.on('invalidate', () => {
            changeStream.close();
        });

        this.once('revoked', () => changeStream.close());

        return changeStream;
    }

    async catchUp(...keys: string[]) {

        const changeStream = this.subscribe(...keys);

        changeStream.on('change', (event) => {
            switch (event.operationType) {
                case 'update':
                case 'insert': {
                    const doc = event.fullDocument;
                    if (!doc) {
                        break;
                    }
                    const thing = this.confMap.get(doc._id) || doc;
                    _.merge(thing, doc);
                    this.confMap.set(doc._id, thing);

                    this.emit('change', doc._id, thing);

                    break;
                }

                case 'invalidate':
                default: {
                    break;
                }
            }
        });

        const r = await this.collection.find({}).toArray();

        for (const x of r) {
            const thing = this.confMap.get(x._id) || x;

            _.merge(thing, x);

            this.confMap.set(x._id, thing);
        }

        return changeStream;
    }
}


export const mongoConfig = container.resolve(MongoConfig);
