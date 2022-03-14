import _ from 'lodash';
import { ClientSession, ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { AutoCastable, Prop, Also } from '@naiverlabs/tskit';

import { MongoCollection } from './base';

@Also({ dictOf: Object })
export class Session extends AutoCastable {

    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    [k: string]: any;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
    
    @Prop()
    expireAt?: Date;
}


@singleton()
export class MongoSession extends MongoCollection<Session> {
    collectionName = 'sessions';
    typeclass = Session;

    constructor() {
        super(...arguments);

        this.init()
            .catch((err) => this.emit('error', err));
    }

    clear(_id: ObjectId) {
        return this.deleteOne({ _id });
    }

    override async createIndexes(options?: { session?: ClientSession | undefined; }): Promise<void> {
        const indexExpireAtTTL = 'expireAtTTL';
        if (!await this.collection.indexExists(indexExpireAtTTL)) {
            await this.collection.createIndex(
                {
                    expireAt: 1
                },
                {
                    name: indexExpireAtTTL,
                    session: options?.session,
                    background: true,
                    sparse: true,
                    expireAfterSeconds: 0,
                }
            );
        }
    }

}


export const mongoSession = container.resolve(MongoSession);
export default mongoSession;
