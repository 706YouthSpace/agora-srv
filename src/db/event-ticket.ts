import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';

import { AutoCastable, Prop } from '@naiverlabs/tskit';

import { MongoCollection } from './base';


export class EventTicket extends AutoCastable {

    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ required: true })
    userId!: ObjectId;

    @Prop({ required: true })
    activityId!: ObjectId;

    @Prop({ required: true })
    transactionId!: ObjectId;

    @Prop({ dictOf: Object, default: {} })
    info!: { [key: string]: any };

    @Prop({ default: false })
    paid!: boolean;

    @Prop({ default: false })
    needToPay!: boolean;

    @Prop({ required: true })
    wxAppId!: string;

}

@singleton()
export class MongoEventTicket extends MongoCollection<EventTicket> {
    collectionName = 'eventTicket';

}

export const mongoSignUp = container.resolve(MongoEventTicket);
