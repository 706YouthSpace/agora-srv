import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface Session {
    _id: ObjectId;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoSession extends MongoCollection<Session> {
    collectionName = 'sessions';

    clear(_id: ObjectId) {
        return this.collection.deleteOne({ _id });
    }
    

}


export const mongoSession = container.resolve(MongoSession);
