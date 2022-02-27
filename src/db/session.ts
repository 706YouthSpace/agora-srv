import _ from 'lodash';
import { ObjectId } from "mongodb";
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
}


@singleton()
export class MongoSession extends MongoCollection<Session> {
    collectionName = 'sessions';

    clear(_id: ObjectId) {
        return this.deleteOne({ _id });
    }

}


export const mongoSession = container.resolve(MongoSession);
