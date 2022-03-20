import _ from 'lodash';
import { ClientSession, ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';

import { AutoCastable, Prop } from '@naiverlabs/tskit';

import { MongoCollection } from './base';

export enum TICKET_STATUS {
    PENDING_PAYMENT = 'pending_payment',
    EXPIRED = 'expired',
    CANCELLED = 'cancelled',
    VALID = 'valid',

}
export class EventTicket extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ required: true })
    userId!: ObjectId;

    @Prop({ required: true })
    eventId!: ObjectId;

    @Prop()
    transactionId?: ObjectId;

    @Prop({ dictOf: Object, default: {} })
    collectFromParticipant!: { [key: string]: any };

    @Prop({ default: false })
    needToPay!: boolean;

    @Prop({ required: true })
    wxAppId!: string;

    @Prop()
    wxNotifyTemplateId?: string;

    @Prop({ required: true, type: TICKET_STATUS, default: TICKET_STATUS.PENDING_PAYMENT })
    status!: TICKET_STATUS;

    @Prop()
    createdAt?: Date;
    @Prop()
    updatedAt?: Date;
}

@singleton()
export class MongoEventTicket extends MongoCollection<EventTicket> {
    collectionName = 'eventTicket';
    typeclass = EventTicket;

    constructor() {
        super(...arguments);

        this.init()
            .catch((err) => this.emit('error', err));
    }

    override async createIndexes(options?: { session?: ClientSession | undefined; }): Promise<void> {
        const indexSortByUserId = 'sortByUserId';
        if (!await this.collection.indexExists(indexSortByUserId)) {
            await this.collection.createIndex(
                {
                    userId: 1
                },
                {
                    name: indexSortByUserId,
                    session: options?.session,
                    background: true,
                    sparse: true
                }
            );
        }

        const indexSortByEventId = 'sortByEventId';
        if (!await this.collection.indexExists(indexSortByEventId)) {
            await this.collection.createIndex(
                {
                    eventId: 1
                },
                {
                    name: indexSortByEventId,
                    session: options?.session,
                    background: true,
                    sparse: true
                }
            );
        }
    }

}

export const mongoSignUp = container.resolve(MongoEventTicket);

export default mongoSignUp;
