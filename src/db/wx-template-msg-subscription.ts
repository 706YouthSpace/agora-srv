import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { AutoCastable, Prop } from '@naiverlabs/tskit';

import { MongoCollection } from './base';


export class WxTemplateMsgSubscription extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ required: true })
    wxAppId!: string;

    @Prop({ required: true })
    userId!: ObjectId;

    @Prop({ required: true })
    templateId!: string;

    @Prop({ required: true })
    wxSomeStupidId!: string;

    @Prop({ default: 1 })
    quota!: number;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;
}

@singleton()
export class MongoWxTemplateMsgSubscription extends MongoCollection<WxTemplateMsgSubscription> {
    collectionName = 'wxTemplateMsgSubscription';

}

export const mongoWxTemplateMsgSubscription = container.resolve(MongoWxTemplateMsgSubscription);
