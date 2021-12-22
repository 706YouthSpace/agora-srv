import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export enum PersonalInfo {
    NAME = 'name',
    CELLPHONE = 'cellphone',
    GENDER = 'gender',
    WECHAT = 'wechat',
    BIO = 'bio'
}

export interface Activity {
    _id: ObjectId;

    title: string;
    subtitle?: string;
    detail: string;

    type: string;

    image?: string | ObjectId;
    images?: Array<string | ObjectId>;

    locationText?: string;
    locationCoord?: [number, number];
    locationGB2260?: string;
    site?: ObjectId;

    host: ObjectId;
    participants: ObjectId[];

    participantCap?: number;

    pricing?: number;

    tags: string[];

    collectFromParticipants?: string[];

    qrImage?: string | ObjectId;

    startAt: Date;
    endAt: Date;

    verified?: string;

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;
    creator: ObjectId;
    templateId: string;
}


@singleton()
export class MongoActivities extends MongoCollection<Activity> {
    collectionName = 'activities';

}


export const mongoActivities = container.resolve(MongoActivities);
