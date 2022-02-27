import { randomUUID } from 'crypto';
import { EventEmitter } from 'stream';
import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { ChangeStreamDocument, ChangeStream, ClientSession } from 'mongodb';
import { vectorize } from '@naiverlabs/tskit';
import { MongoCollection } from './base';

export interface Config {
    _id: string;

    [k: string]: any;

    __lockedBy?: string;
    __lockedUntil?: Date;

    __version: number;

    createdAt: Date;
    updatedAt: Date;
}

@singleton()
export class MongoLiveConfig extends MongoCollection<Config, string> {
    collectionName = 'liveconfigs';

    confMap: Map<string, Config> = new Map();
    emitters: Map<string, ConfigObjEventEmitter> = new Map();

    subscriptionKeys?: string[];

    changeStream!: ChangeStream;

    protected lastChangeId?: string;

    instanceUUID = randomUUID();

    constructor() {
        super(...arguments);

        this.on('change', (id, doc, event) => {
            const emitter = this.emitters.get(id);
            if (!emitter) {
                return;
            }

            emitter.emit('changed', doc, event);
        });

        this.on('remove', (id, doc, event) => {
            const emitter = this.emitters.get(id);
            if (!emitter) {
                return;
            }

            emitter.emit('removed', doc, event);
        });

        this.init()
            .catch((err) => this.emit('error', err));
    }

    override async init() {
        await super.init();

        const subscription = await this.catchUp(...(this.subscriptionKeys || []));

        subscription.on('error', () => this.emit('crippled'));
        subscription.on('close', () => this.emit('crippled'));


        this.emit('ready');
    }

    override async get(_id: string, options?: { session?: ClientSession; }) {
        const r = await this.findOne({ _id }, options);

        if (!r) {
            throw new Error(`Invalid config key: ${_id}, empty content`);
        }

        return r;
    }

    override async set(_id: string, data: { [k: string]: any; }, options?: { session?: ClientSession; }) {
        const now = new Date();
        const oldOne = this.localGet(_id);
        const query: any = { _id };
        let setVersion = 1;
        if (Number.isInteger(oldOne?.__version)) {
            query.__version = oldOne!.__version;
            setVersion = query.__version + 1;
        }
        const r = await this.collection.findOneAndUpdate(
            query,
            {
                $set: vectorize({ ..._.omit(data, '_id'), updatedAt: now, __version: setVersion }),
                $setOnInsert: { createdAt: now }
            } as any,
            { upsert: true, returnDocument: 'after', ...options }
        );
        if (!r.ok) {
            throw r.lastErrorObject;
        }
        return r.value! as Config;
    }

    async touch(_id: string, options?: { session?: ClientSession; }) {
        const now = new Date();
        const oldOne = this.localGet(_id);
        const query: any = { _id };
        let setVersion = 1;
        if (Number.isInteger(oldOne?.__version)) {
            query.__version = oldOne!.__version;
            setVersion = query.__version + 1;
        }
        const r = await this.collection.findOneAndUpdate(
            query,
            {
                $set: { updatedAt: now, __version: setVersion },
                $setOnInsert: { createdAt: now }
            } as any,
            { upsert: true, returnDocument: 'after', ...options }
        );
        if (!r.ok) {
            throw r.lastErrorObject;
        }
        return r.value! as Config;
    }


    watch(_id: string) {
        if (this.emitters.has(_id)) {
            return this.emitters.get(_id)!;
        }
        const emitter = new EventEmitter() as ConfigObjEventEmitter;

        this.emitters.set(_id, emitter);
        emitter.unwatch = () => this.unwatch(_id);

        return emitter;
    }

    unwatch(_id: string) {
        if (!this.emitters.has(_id)) {
            return;
        }

        const emitter = this.emitters.get(_id)!;

        this.emitters.delete(_id);

        return emitter as ConfigObjEventEmitter;
    }

    localGet(_id: string) {
        return this.confMap.get(_id);
    }

    async catchUp(...keys: string[]) {
        const changeStream = this.subscribe({ startAfter: this.lastChangeId });

        changeStream.on('change', (event) => {
            this.lastChangeId = event._id;

            switch (event.operationType) {
                case 'replace':
                case 'update':
                case 'insert': {
                    const doc = event.fullDocument;
                    if (!doc) {
                        break;
                    }
                    const thing = this.confMap.get(doc._id) || doc;
                    // !!! Merge new doc into the old one may have issues.
                    // TODO: Deal with removed props.
                    _.merge(thing, doc);
                    this.confMap.set(doc._id, thing);

                    this.emit('change', doc._id, thing, event);

                    break;
                }

                case 'delete': {
                    if (!event.documentKey) {
                        break;
                    }
                    const phantomDoc = this.confMap.get(event.documentKey as any);
                    this.confMap.delete(event.documentKey as any);
                    if (phantomDoc) {
                        this.emit('remove', phantomDoc._id, phantomDoc, event);
                    }

                    break;
                }

                case 'invalidate':
                default: {
                    break;
                }
            }
        });

        changeStream.once('close', () => this.emit('crippled'));

        const query = keys.length ? { _id: { $in: keys } } : {};

        const r = await this.simpleFind(query);

        for (const x of r) {
            const thing = this.confMap.get(x._id) || x;

            _.merge(thing, x);

            this.confMap.set(x._id, thing);
        }

        return changeStream;
    }
}

export interface MongoLiveConfig {
    on(event: 'change', listener: (id: string, doc: Config, event: ChangeStreamDocument<Config>) => void): this;
    on(event: 'remove', listener: (id: string, doc: Config, event: ChangeStreamDocument<Config>) => void): this;

    on(event: 'ready', listener: () => void): this;
    on(event: 'crippled', listener: (err?: Error | any) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
}

export interface ConfigObjEventEmitter extends EventEmitter {
    on(event: 'changed', listener: (doc: Config, event: ChangeStreamDocument<Config>) => void): this;
    on(event: 'removed', listener: (doc: Config, event: ChangeStreamDocument<Config>) => void): this;

    on(event: string | symbol, listener: (...args: any[]) => void): this;

    unwatch(): void;
}



export const mongoConfig = container.resolve(MongoLiveConfig);
