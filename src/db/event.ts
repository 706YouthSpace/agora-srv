import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { ObjectId } from "mongodb";
import { AutoCastable, Prop } from '@naiverlabs/tskit';

import { MongoCollection } from './base';

export enum PersonalInfo {
    NAME = 'name',
    CELLPHONE = 'cellphone',
    GENDER = 'gender',
    WECHAT = 'wechat',
    BIO = 'bio'
}

export enum EVENT_TYPE {
    PUBLIC = 'public',
    PRIVATE = 'private'
}

export enum EVENT_SENSOR_STATUS {
    PENDING = 'pending',
    PASSED = 'passed',
    REJECTED = 'rejected'
}

export class Event extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ required: true })
    title!: string;

    @Prop()
    subtitle?: string;

    @Prop()
    detail?: string;

    @Prop({ type: EVENT_TYPE, default: EVENT_TYPE.PUBLIC })
    type!: EVENT_TYPE;

    @Prop({ type: [ObjectId, String] })
    image?: string | ObjectId;

    @Prop({ arrayOf: [ObjectId, String] })
    images?: Array<string | ObjectId>;

    @Prop()
    locationText?: string;
    @Prop({ arrayOf: [Number], validateCollection: (val: number[]) => val.length === 2 })
    locationCoord?: [number, number];

    @Prop()
    locationGB2260?: string;

    @Prop()
    site?: ObjectId;

    @Prop()
    host?: ObjectId;

    @Prop({ arrayOf: ObjectId, default: [] })
    participants!: ObjectId[];

    @Prop()
    participantCap?: number;

    @Prop()
    pricing?: number;

    @Prop({ default: [], arrayOf: String })
    tags!: string[];

    @Prop({ default: [], arrayOf: String })
    collectFromParticipants?: string[];

    @Prop({ type: [ObjectId, String] })
    qrImage?: string | ObjectId;

    @Prop({ required: true })
    startAt!: Date;

    @Prop({ required: true })
    endAt!: Date;

    @Prop({ type: EVENT_SENSOR_STATUS, default: EVENT_SENSOR_STATUS.PENDING })
    status!: EVENT_SENSOR_STATUS;

    @Prop()
    createdAt?: Date;
    @Prop()
    updatedAt?: Date;

    @Prop({ required: true })
    creator!: ObjectId;

    @Prop({
        arrayOf: String
    })
    wxMsgTemplateIds?: string[];
}


@singleton()
export class MongoEvent extends MongoCollection<Event> {
    collectionName = 'events';
    typeclass = Event;
}


export const mongoEvent = container.resolve(MongoEvent);
