import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface activityTag {
    _id: ObjectId;

    code: string;
    name: string;

}


@singleton()
export class MongoActivityTag extends MongoCollection<activityTag> {
    collectionName = 'activityTags';

}


export const mongoActivityTag = container.resolve(MongoActivityTag);
