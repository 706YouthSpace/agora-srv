import { Also, AutoCastable, Prop } from '@naiverlabs/tskit';
import { randomUUID } from 'crypto';
import _ from 'lodash';
import { ObjectId } from "mongodb";
import { currencyAmount } from '../app/validators';
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';


export enum TRANSACTION_STATUS {
    CREATED = 'Created',

    PAYMENT_PENDING = 'Unpaid',
    PAYMENT_SUCCEED = 'Paid',

    COMPLETED = 'Completed',
    REFUNDED = 'Refunded',

    CLOSED = 'Closed',
}

export enum TRANSACTION_PROGRESS {
    CREATED = 'Created',

    INITIATED = 'Initiated',
    IN_PROGRESS = 'InProgress',

    COMPLETED = 'Completed',
    REFUND_IN_PROGRESS = 'RefoundInProgress',
    REFUNDED = 'Refunded',

    ERRORED = 'Errored',
    CLOSED = 'Closed',
}

export enum CURRENCY {
    CNY = 'CNY',
}

export enum TRANSACTION_REASON {
    EVENT_TICKET_PURCHASE = 'eventTicket',
    GOODS_PURCHASE = 'goodsPurchase',
    MEMBERSHIP_PURCHASE = 'membershipPurchase',

}

@Also({ dictOf: Object })
export class WxSpecificTransactionDetails extends AutoCastable {
    @Prop({ required: true })
    merchId!: string;

    @Prop({ required: true })
    appId!: string;

    @Prop({ required: true })
    openId!: string;

    @Prop()
    wxTransactionId?: string;

    @Prop({ default: TRANSACTION_PROGRESS.CREATED, type: TRANSACTION_PROGRESS })
    progress!: TRANSACTION_PROGRESS;

    @Prop()
    wxResult?: { [k: string]: any };

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;

    @Prop()
    initiatedAt?: Date;

    @Prop()
    expireAt?: Date;

    @Prop()
    completedAt?: Date;

    @Prop()
    wxMsgTemplateId?: string;

    toWxTransactionCreationDto() {

        const partial: any = {
            merchid: this.merchId,
            appid: this.appId,
            payer: {
                openid: this.openId
            }
        };

        if (this.expireAt) {
            partial.time_expire = this.expireAt;
        }

        return partial;
    }
}

export class Transaction extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ defaultFactory: () => randomUUID() })
    uuid!: string;

    @Prop({ required: true })
    title!: string;

    @Prop({ required: true, type: TRANSACTION_REASON })
    reason!: TRANSACTION_REASON;

    @Prop({ required: true })
    fromUserId!: ObjectId;

    @Prop()
    wxPay?: WxSpecificTransactionDetails;

    @Prop({ required: true, validate: currencyAmount })
    currencyAmount!: number;
    @Prop({ default: CURRENCY.CNY })
    currencyType!: CURRENCY;

    @Prop({ default: TRANSACTION_STATUS.CREATED, type: TRANSACTION_STATUS })
    status!: TRANSACTION_STATUS;

    @Prop({ default: [] })
    tags!: string[];

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;

    createWxTransactionCreationDto(draft?: Partial<WxSpecificTransactionDetails>) {
        if (draft) {
            this.wxPay = WxSpecificTransactionDetails.from({
                ...this.wxPay,
                ...draft
            });
        }
        if (!this.wxPay) {
            throw new Error('No wxPay details found');
        }

        const partial: any = this.wxPay.toWxTransactionCreationDto();

        partial.out_trade_no = this._id.toHexString();
        partial.description = this.title;
        partial.amount = {
            total: this.currencyAmount,
            currency: this.currencyType
        };

        return partial;
    }
}


@singleton()
export class MongoTransaction extends MongoCollection<Transaction> {
    collectionName = 'transactions';

}


export const mongoTransaction = container.resolve(MongoTransaction);
