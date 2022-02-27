import { AutoCastable, Prop } from '@naiverlabs/tskit';
import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';

export enum SITE_TYPE {
    BASE = '706Owned',
    LIFE_LAB = '706LifeLab',
    SHARED_LIVING_ROOM = '706SharedLivingroom',
    PUBLIC_PLACES = 'public',
    PRIVATE_PLACES = 'private'
}
export class Site extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ required: true })
    name!: string;

    @Prop({ required: true, type: SITE_TYPE })
    type!: SITE_TYPE;

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

    @Prop({ default: [], arrayOf: String })
    tags!: string[];

    @Prop()
    creator?: ObjectId;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}


@singleton()
export class MongoSite extends MongoCollection<Site> {
    collectionName = 'sites';

}


export const mongoSite = container.resolve(MongoSite);
