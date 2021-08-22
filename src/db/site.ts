import _ from 'lodash';
import { ObjectId } from "mongodb";
import { deepCreate, vectorize } from "tskit";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface Site {
    _id: ObjectId;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;

}


@singleton()
export class MongoSites extends MongoCollection<Site> {
    collectionName = 'sites';

}


export const mongoSites = container.resolve(MongoSites);
