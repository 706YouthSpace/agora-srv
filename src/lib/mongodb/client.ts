// tslint:disable: only-arrow-functions
import {
    MongoClient, MongoClientOptions,
    ReadPreference, ClientSession, IndexOptions,
    CommandCursor, ProfilingLevel, CommonOptions,
    Admin, CollectionCreateOptions,
    AggregationCursor, CollectionBulkWriteOptions,
    BulkWriteOpResultObject, FilterQuery, MongoCountPreferences,
    IndexSpecification, DeleteWriteOpResultObject,
    FindOneOptions, Cursor, FindOneAndDeleteOption, FindOneAndReplaceOption,
    UpdateQuery, FindOneAndUpdateOption, GeoHaystackSearchOptions,
    OrderedBulkOperation, UnorderedBulkOperation,
    CollectionInsertManyOptions, CollectionInsertOneOptions, InsertOneWriteOpResult,
    CollectionMapFunction, CollectionReduceFunction,
    MapReduceOptions, ParallelCollectionScanOptions,
    WriteOpResult, Collection, ReplaceOneOptions,
    ReplaceWriteOpResult, CollStats, UpdateManyOptions,
    UpdateWriteOpResult, UpdateOneOptions, ChangeStreamOptions,
    Timestamp, ChangeStream, CollectionAggregationOptions, ObjectId
} from 'mongodb';

import { EventEmitter } from 'events';

export abstract class DatabaseClient<T> extends EventEmitter {
    protected opQueue: object[] = [];
    avaliable: Boolean = false;
    protected abstract init(options: object): any;
    abstract get client(): T | Promise<T>;
}

export class MongodbClient extends DatabaseClient<MongoClient> {
    mongoUrl: string;
    options: MongoClientOptions;
    protected mongoClient: MongoClient;
    mongoClientPromise: Promise<MongoClient>;

    constructor(url: string, options: MongoClientOptions = {}) {
        super();
        this.options = options;
        this.mongoUrl = url;
        this.mongoClient = new MongoClient(this.mongoUrl, { ...this.options, useUnifiedTopology: true });
        this.avaliable = true;

        this.mongoClientPromise = this.init();
    }

    init() {
        this.mongoClientPromise = (this.mongoClient.connect as any)({ useNewUrlParser: true }).then((client: MongoClient) => {
            const reInitFunc = (_err: any) => {
                if (!client.isConnected()) {
                    client.close().catch();

                    this.mongoClient.removeListener('error', reInitFunc);
                    // tslint:disable-next-line: no-floating-promises
                    this.init();
                }
            };
            this.mongoClient.on('error', reInitFunc);

            return client;
        });

        return this.mongoClientPromise;
    }

    get client() {
        if (this.mongoClient && this.mongoClient.isConnected()) {
            return this.mongoClient;
        }

        return this.mongoClientPromise;
    }

    database(name: string) {
        // tslint:disable-next-line: no-use-before-declare
        return new MongoDatabase(this, name);
    }
}

export const MONGO_ACTUAL_RESULT = Symbol('Actual mongo result');
export interface MongoActualResultMixin<T = any> {
    [MONGO_ACTUAL_RESULT]: T;
}

// const MONGO_CURSOR_FIND_DIRECT_OPTIONS = new Set([
//     'batchSize', 'collation', 'comment', 'hint', 'limit', 'max', 'maxAwaitTimeMS', 'maxScan', 'maxTimeMS',
//     'maxScan', 'maxTimeMS', 'min', 'project', 'returnKey', 'showRecordId', 'skip', 'snapshot', 'sort'
// ]);
// const MONGO_CURSOR_FIND_WRAPPED_OPTIONS = new Set([
//     'flags', 'options', 'readPreference', 'projection'
// ]);

// export interface CursorFindOptions {
//     flags?: { [k: string]: boolean };
//     batchSize?: number;
//     collation?: CollationDocument;
//     comment?: string;
//     hint?: string | object;
//     limit?: number;
//     max?: object;
//     maxAsaitTimeMS?: number;
//     maxScan?: object;
//     maxTimeMS?: number;
//     min?: object;
//     project?: { [k: string]: any };
//     returnKey?: object;
//     options?: { [k: string]: object };
//     readPreference?: ReadPreference;
//     showRecordId?: object;
//     skip?: number;
//     snapshot?: object;
//     sort?: object | object[];
// }

export class MongoCollection<TSchema = any> {
    mongoClient: MongodbClient;
    dbName: string;
    collectionName: string;

    session?: ClientSession;

    constructor(mongoClient: MongodbClient, dbName: string, collectionName: string) {
        this.mongoClient = mongoClient;
        this.dbName = dbName;
        this.collectionName = collectionName;
    }

    bindSession(session: ClientSession) {
        this.session = session;

        return this;
    }

    _patchOptions<T>(options?: T): T | undefined | T & { session: ClientSession } | { session: ClientSession } {

        if (!this.session) {
            return options;
        }

        if (options) {
            return { ...options, session: this.session };
        }

        return { session: this.session };
    }

    get collection() {
        const client = this.mongoClient.client;

        if (client instanceof MongoClient) {
            return client.db(this.dbName).collection<TSchema>(this.collectionName);
        }

        return client.then((x) => x.db(this.dbName).collection<TSchema>(this.collectionName));
    }

    async insertOne(doc: OptionalId<TSchema>, options?: CollectionInsertOneOptions) {
        const coll = await this.collection;

        const result = await coll.insertOne(doc, this._patchOptions(options));

        const docWithId: MongoActualResultMixin<InsertOneWriteOpResult> & TSchema & { _id: ObjectId } = {
            ...doc, _id: result.insertedId,
            [MONGO_ACTUAL_RESULT]: result
        } as any;

        return Promise.resolve(docWithId);
    }

    async insertMany(docs: Array<OptionalId<TSchema>>, options?: CollectionInsertManyOptions) {
        const coll = await this.collection;

        const result = await coll.insertMany(docs, this._patchOptions(options));

        const docWithIds = docs.map((doc, idx) => {
            const docWithId: MongoActualResultMixin<InsertOneWriteOpResult> & TSchema & { _id: ObjectId } = {
                ...doc, _id: result.insertedIds[idx],
                [MONGO_ACTUAL_RESULT]: result
            } as any;

            return docWithId;
        });

        return Promise.resolve(docWithIds);
    }

    async findOneAndDelete(filter: FilterQuery<TSchema>, options?: FindOneAndDeleteOption): Promise<(TSchema & MongoActualResultMixin) | undefined> {
        const coll = await this.collection;

        const result = await coll.findOneAndDelete(filter, this._patchOptions(options));

        if (!result.value) {
            const val: any = Promise.resolve(result.value);
            val[MONGO_ACTUAL_RESULT] = result;

            return val;
        }

        const doc: TSchema & MongoActualResultMixin<typeof result> = {
            ...result.value,
            [MONGO_ACTUAL_RESULT]: result
        } as any;

        return doc;
    }

    async findOneAndReplace(
        filter: FilterQuery<TSchema>,
        replacement: object,
        options?: FindOneAndReplaceOption
    ): Promise<(TSchema & MongoActualResultMixin) | undefined> {
        const coll = await this.collection;
        const result = await coll.findOneAndReplace(filter, replacement, this._patchOptions(options));

        if (!result.value) {
            const val: MongoActualResultMixin<typeof result> & Promise<typeof result.value> = Promise.resolve(result.value) as any;
            val[MONGO_ACTUAL_RESULT] = result;

            return val as any;
        }

        const doc: TSchema & MongoActualResultMixin<typeof result> = {
            ...result.value,
            [MONGO_ACTUAL_RESULT]: result
        } as any;

        return doc;

    }

    async findOneAndUpdate(
        filter: FilterQuery<TSchema>,
        update: UpdateQuery<TSchema> | TSchema,
        options?: FindOneAndUpdateOption
    ): Promise<(TSchema & MongoActualResultMixin) | undefined> {
        const coll = await this.collection;
        const result = await coll.findOneAndUpdate(filter, update, this._patchOptions(options));

        if (!result.value) {
            const val: MongoActualResultMixin<typeof result> & Promise<typeof result.value> = Promise.resolve(result.value) as any;
            val[MONGO_ACTUAL_RESULT] = result;

            return val as any;
        }

        const doc: TSchema & MongoActualResultMixin<typeof result> = {
            ...result.value,
            [MONGO_ACTUAL_RESULT]: result
        } as any;

        return doc;
    }

    async simpleFind(query: FilterQuery<TSchema>, options?: FindOneOptions) {
        const cursor = await this.find(query, options);

        return cursor.toArray();
    }

    async steamFind(query: FilterQuery<TSchema>, options?: FindOneOptions) {
        const cursor = await this.find(query, options);

        return cursor.stream();
    }

}

type OptionalId<TSchema> = Omit<TSchema, '_id'> & { _id?: any };
export interface MongoCollection<TSchema = any> {
    aggregate<T = TSchema>(
        pipeline?: object[],
        options?: CollectionAggregationOptions
    ): Promise<AggregationCursor<T>>;
    bulkWrite(operations: object[], options?: CollectionBulkWriteOptions): Promise<BulkWriteOpResultObject>;
    count(query?: FilterQuery<TSchema>, options?: MongoCountPreferences): Promise<number>;
    countDocuments(query?: FilterQuery<TSchema>, options?: MongoCountPreferences): Promise<number>;
    createIndex(fieldOrSpec: string | any, options?: IndexOptions): Promise<any>;
    createIndexes(indexSpecs: IndexSpecification[], options?: { session?: ClientSession }): Promise<any>;
    deleteMany(filter: FilterQuery<TSchema>, options?: CommonOptions): Promise<DeleteWriteOpResultObject>;
    deleteOne(filter: FilterQuery<TSchema>, options?: CommonOptions & { bypassDocumentValidation?: boolean }): Promise<DeleteWriteOpResultObject>;
    distinct(
        key: string,
        query: FilterQuery<TSchema>,
        options?: { readPreference?: ReadPreference | string; maxTimeMS?: number; session?: ClientSession }
    ): Promise<any>;
    drop(options?: { session: ClientSession }): Promise<any>;
    dropIndex(indexName: string, options?: CommonOptions & { maxTimeMS?: number }): Promise<any>;
    dropIndexes(options?: { session?: ClientSession; maxTimeMS?: number }): Promise<any>;
    estimatedDocumentCount(options?: MongoCountPreferences): Promise<number>;
    find<T = TSchema>(query: FilterQuery<TSchema>, options?: FindOneOptions): Promise<Cursor<T>>;
    findOne<T = TSchema>(filter: FilterQuery<TSchema>, options?: FindOneOptions): Promise<T | null>;
    // findOneAndDelete(filter: FilterQuery<TSchema>, options?: FindOneAndDeleteOption): Promise<FindAndModifyWriteOpResultObject<TSchema>>;
    // findOneAndReplace(
    //     filter: FilterQuery<TSchema>,
    //     replacement: object,
    //     options?: FindOneAndReplaceOption
    // ): Promise<FindAndModifyWriteOpResultObject<TSchema>>;
    // findOneAndUpdate(
    //     filter: FilterQuery<TSchema>,
    //     update: UpdateQuery<TSchema> | TSchema,
    //     options?: FindOneAndUpdateOption
    // ): Promise<FindAndModifyWriteOpResultObject<TSchema>>;
    geoHaystackSearch(x: number, y: number, options?: GeoHaystackSearchOptions): Promise<any>;
    indexes(options?: { session: ClientSession }): Promise<any>;
    indexExists(indexes: string | string[], options?: { session: ClientSession }): Promise<boolean>;
    indexInformation(options?: { full: boolean; session: ClientSession }): Promise<any>;
    initializeOrderedBulkOp(options?: CommonOptions): Promise<OrderedBulkOperation>;
    initializeUnorderedBulkOp(options?: CommonOptions): Promise<UnorderedBulkOperation>;
    // insertMany(docs: Array<OptionalId<TSchema>>, options?: CollectionInsertManyOptions): Promise<InsertWriteOpResult>;
    // insertOne(docs: OptionalId<TSchema>, options?: CollectionInsertOneOptions): Promise<InsertOneWriteOpResult>;
    isCapped(options?: { session: ClientSession }): Promise<any>;
    listIndexes(options?: { batchSize?: number; readPreference?: ReadPreference | string; session?: ClientSession }): Promise<CommandCursor>;
    mapReduce<TKey, TValue>(
        map: CollectionMapFunction<TSchema> | string,
        reduce: CollectionReduceFunction<TKey, TValue> | string,
        options?: MapReduceOptions
    ): Promise<any>;
    options(options?: { session: ClientSession }): Promise<any>;
    parallelCollectionScan(options?: ParallelCollectionScanOptions): Promise<Array<Cursor<any>>>;
    reIndex(options?: { session: ClientSession }): Promise<any>;
    remove(selector: object, options?: CommonOptions & { single?: boolean }): Promise<WriteOpResult>;
    rename(newName: string, options?: { dropTarget?: boolean; session?: ClientSession }): Promise<Collection<TSchema>>;
    replaceOne(filter: FilterQuery<TSchema>, doc: TSchema, options?: ReplaceOneOptions): Promise<ReplaceWriteOpResult>;
    stats(options?: { scale: number; session?: ClientSession }): Promise<CollStats>;
    updateMany(filter: FilterQuery<TSchema>, update: UpdateQuery<TSchema> | TSchema, options?: UpdateManyOptions): Promise<UpdateWriteOpResult>;
    updateOne(filter: FilterQuery<TSchema>, update: UpdateQuery<TSchema> | TSchema, options?: UpdateOneOptions): Promise<UpdateWriteOpResult>;
    watch(pipeline?: object[], options?: ChangeStreamOptions & { startAtOperationTime?: Timestamp; session?: ClientSession }): Promise<ChangeStream>;
}

const mongoCollectionMethods = new Set([
    'aggregate', 'bulkWrite', 'count', 'countDocuments', 'createIndex', 'createIndexes', 'deleteMany',
    'deleteOne', 'distinct', 'drop', 'dropIndex', 'dropIndexes', 'estimatedDocumentCount', 'find', 'findOne',
    'findOneAndDelete', 'findOneAndReplace', 'findOneAndUpdate', 'geoHaystackSearch', 'indexes', 'indexExists',
    'indexInformation', 'initializeOrderedBulkOp', 'initializeUnorderedBulkOp', 'insertMany', 'insertOne',
    'isCapped', 'listIndexes', 'mapReduce', 'options', 'parallelCollectionScan', 'reIndex', 'remove', 'rename',
    'replaceOne', 'stats', 'updateMany', 'updateOne', 'watch',
]);
const mongoCollectionMethodsWhichOptionIsAtParam1 = new Set([
    'drop', 'dropIndexes', 'indexes', 'indexInformation', 'initializeOrderedBulkOp', 'initializeUnorderedBulkOp',
    'isCapped', 'listIndexes', 'options', 'reIndex', 'stats',
]);
const mongoCollectionMethodsWhichOptionIsAtParam3 = new Set([
    'distinct', 'findOneAndReplace', 'findOneAndUpdate', 'geoHaystackSearch', 'mapReduce', 'replaceOne',
    'updateMany', 'updateOne',
]);

const SPECIALLY_WRAPPED = new Set(['insertOne', 'insertMany', 'findOneAndDelete', 'findOneAndReplace', 'findOneAndUpdate']);

for (const method of mongoCollectionMethods) {
    if (SPECIALLY_WRAPPED.has(method)) {
        continue;
    }

    Reflect.set(MongoCollection.prototype, method, async function (this: MongoCollection, ...argv: any[]) {
        if (mongoCollectionMethodsWhichOptionIsAtParam1.has(method)) {
            argv[0] = this._patchOptions(argv[0]);
        } else if (mongoCollectionMethodsWhichOptionIsAtParam3.has(method)) {
            argv[2] = this._patchOptions(argv[2]);
        } else {
            argv[1] = this._patchOptions(argv[1]);
        }

        const coll = await this.collection;

        return (coll as any)[method](...argv);
    });

}

export class MongoDatabase {
    mongoClient: MongodbClient;
    dbName: string;

    constructor(mongoClient: MongodbClient, dbName: string) {
        this.mongoClient = mongoClient;
        this.dbName = dbName;
    }

    get db() {
        const client = this.mongoClient.client;

        if (client instanceof MongoClient) {
            return client.db(this.dbName);
        }

        return client.then((x) => x.db(this.dbName));
    }

    collection(collectionName: string, overridingClass: any = MongoCollection) {
        return new overridingClass(this.mongoClient, this.dbName, collectionName);
    }


    async createCollection<TSchema = any>(name: string, options?: CollectionCreateOptions) {
        const db = await this.db;
        await db.createCollection<TSchema>(name, options);

        return new MongoCollection<TSchema>(this.mongoClient, this.dbName, name);
    }

    async renameCollection<TSchema = any>(fromCollection: string, toCollection: string, options?: { dropTarget?: boolean }) {
        const db = await this.db;
        await db.renameCollection<TSchema>(fromCollection, toCollection, options);

        return new MongoCollection<TSchema>(this.mongoClient, this.dbName, toCollection);
    }
}

export interface MongoDatabase {
    admin(): Promise<Admin>;
    command(command: object, options?: { readPreference: ReadPreference | string; session?: ClientSession }): Promise<any>;
    // createCollection<TSchema = any>(name: string, options?: CollectionCreateOptions): Promise<MongoCollection<TSchema>>;
    createIndex(name: string, fieldOrSpec: string | object, options?: IndexOptions): Promise<any>;
    dropCollection(name: string): Promise<boolean>;
    dropDatabase(): Promise<any>;
    executeDbAdminCommand(command: object, options?: { readPreference?: ReadPreference | string; session?: ClientSession }): Promise<any>;
    indexInformation(name: string, options?: { full?: boolean; readPreference?: ReadPreference | string }): Promise<any>;
    listCollections(
        filter?: object,
        options?: {
            nameOnly?: boolean;
            batchSize?: number;
            readPreference?: ReadPreference | string;
            session?: ClientSession;
        }
    ): Promise<CommandCursor>;
    profilingInfo(options?: { session?: ClientSession }): Promise<void>;
    profilingLevel(options?: { session?: ClientSession }): Promise<ProfilingLevel>;
    removeUser(username: string, options?: CommonOptions): Promise<any>;
    // renameCollection<TSchema = any>(
    //     fromCollection: string, toCollection: string, options?: { dropTarget?: boolean }
    // ): Promise<Collection<TSchema>>;
    setProfilingLevel(level: ProfilingLevel, options?: { session?: ClientSession }): Promise<ProfilingLevel>;
    stats(options?: { scale?: number }): Promise<any>;
}

const mongoDBMethods = new Set([
    'admin', 'command', 'createIndex', 'dropCollection', 'dropDatabase', 'executeDbAdminCommand',
    'indexInformation', 'listCollections', 'profilingInfo', 'profilingLevel', 'removeUser',
    'setProfilingLevel', 'stats',
]);

for (const method of mongoDBMethods) {

    Reflect.set(MongoDatabase.prototype, method, async function (this: MongoDatabase, ...argv: any[]) {
        const db = await this.db;

        return (db as any)[method](...argv);
    });

}

