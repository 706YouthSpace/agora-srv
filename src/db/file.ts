import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export interface FileRecord {
    _id: ObjectId;

    owner: ObjectId;
    ownerType: string;

    sha256SumHex: string;

    name: string;

    mimeType?: string;
    size?: number;

    properties?: {
        [k: string]: any;
    }

    createdAt: Date;
    updatedAt: Date;

    blocked?: boolean;
}


@singleton()
export class MongoFile extends MongoCollection<FileRecord> {
    collectionName = 'files';

}


export const mongoFile = container.resolve(MongoFile);
