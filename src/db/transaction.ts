import { Also, AutoCastable, Prop } from '@naiverlabs/tskit';
import { randomUUID } from 'crypto';
import _ from 'lodash';
import { ClientSession, ObjectId } from "mongodb";
import { currencyAmount } from '../app/validators';
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';
import { WXPAY_TRADE_STATE } from '../services/wechat/dto/wx-pay-common';


export enum TRANSACTION_STATUS {
    CREATED = 'Created',

    PAYMENT_PENDING = 'Unpaid',
    PAYMENT_SUCCEEDED = 'Paid',

    COMPLETED = 'Completed',
    REFUNDED = 'Refunded',

    CLOSED = 'Closed',
    ERRORED = 'Errored'
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
export function mapWxTradeStateToTransactionProgress(state: WXPAY_TRADE_STATE): TRANSACTION_PROGRESS {

    switch (state) {
        case WXPAY_TRADE_STATE.SUCCESS: {
            return TRANSACTION_PROGRESS.COMPLETED;
        }
        case WXPAY_TRADE_STATE.NOTPAY: {
            return TRANSACTION_PROGRESS.INITIATED;
        }
        case WXPAY_TRADE_STATE.USERPAYING: {
            return TRANSACTION_PROGRESS.IN_PROGRESS;
        }
        case WXPAY_TRADE_STATE.REFUND: {
            return TRANSACTION_PROGRESS.REFUND_IN_PROGRESS;
        }
        case WXPAY_TRADE_STATE.REVOKED: {
            return TRANSACTION_PROGRESS.REFUNDED;
        }
        case WXPAY_TRADE_STATE.CLOSED: {
            return TRANSACTION_PROGRESS.CLOSED;
        }
        case WXPAY_TRADE_STATE.PAYERROR: {
            return TRANSACTION_PROGRESS.ERRORED;
        }

        default: {
            return TRANSACTION_PROGRESS.INITIATED;
        }
    }
}

export function mapWxTransactionProgressToTransactionStatus(state: TRANSACTION_PROGRESS): TRANSACTION_STATUS {

    switch (state) {
        case TRANSACTION_PROGRESS.REFUND_IN_PROGRESS:
        case TRANSACTION_PROGRESS.COMPLETED: {
            return TRANSACTION_STATUS.PAYMENT_SUCCEEDED;
        }

        case TRANSACTION_PROGRESS.IN_PROGRESS:
        case TRANSACTION_PROGRESS.INITIATED: {
            return TRANSACTION_STATUS.PAYMENT_PENDING;
        }

        case TRANSACTION_PROGRESS.REFUNDED: {
            return TRANSACTION_STATUS.REFUNDED;
        }
        case TRANSACTION_PROGRESS.CLOSED: {
            return TRANSACTION_STATUS.CLOSED;
        }
        case TRANSACTION_PROGRESS.ERRORED: {
            return TRANSACTION_STATUS.ERRORED;
        }

        default: {
            return TRANSACTION_STATUS.CREATED;
        }
    }
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

    toWxTransactionCreationDto() {

        const partial: any = {
            merchid: this.merchId,
            appid: this.appId,
            payer: {
                openid: this.openId
            }
        };

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

    @Prop()
    targetId?: ObjectId;

    @Prop()
    targetType?: string;

    @Prop({ default: [] })
    tags!: string[];

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;

    @Prop()
    expireAt?: Date;

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

        if (this.expireAt) {
            partial.time_expire = this.expireAt;
        }

        return partial;
    }

    createWxTransactionRefundDto(reason?: string) {
        if (!this.wxPay) {
            throw new Error('No wxPay details found');
        }

        const partial: any = {};
        if (this.wxPay.wxTransactionId) {
            partial.transaction_id = this.wxPay.wxTransactionId;
        }
        partial.out_trade_no = this._id.toHexString();
        partial.out_refund_no = this._id.toHexString();
        partial.reason = reason || this.title;
        partial.amount = {
            refund: this.currencyAmount,
            total: this.currencyAmount,
            currency: this.currencyType
        };

        return partial;
    }
}


@singleton()
export class MongoTransaction extends MongoCollection<Transaction> {
    collectionName = 'transactions';
    typeclass = Transaction;

    constructor() {
        super(...arguments);

        this.init()
            .catch((err) => this.emit('error', err));
    }

    override async createIndexes(options?: { session?: ClientSession | undefined; }): Promise<void> {
        const indexSortByFromUserId = 'sortByFromUserId';
        if (!await this.collection.indexExists(indexSortByFromUserId)) {
            await this.collection.createIndex(
                {
                    fromUserId: 1
                },
                {
                    name: indexSortByFromUserId,
                    session: options?.session,
                    background: true,
                    sparse: true,
                }
            );
        }

        const indexSortByTargetId = 'sortByTargetId';
        if (!await this.collection.indexExists(indexSortByTargetId)) {
            await this.collection.createIndex(
                {
                    targetId: 1
                },
                {
                    name: indexSortByTargetId,
                    session: options?.session,
                    background: true,
                    sparse: true,
                }
            );
        }
    }

}


export const mongoTransaction = container.resolve(MongoTransaction);
export default mongoTransaction;
