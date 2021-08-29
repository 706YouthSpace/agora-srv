import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface Site {
    _id: ObjectId;

    name: string;
    type: string;

    image?: string | ObjectId;
    images?: Array<string | ObjectId>;

    locationText?: string;
    locationCoord?: [number, number];
    locationGB2260?: string;

    tags: string[];

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoSite extends MongoCollection<Site> {
    collectionName = 'sites';

}


export const mongoSite = container.resolve(MongoSite);
