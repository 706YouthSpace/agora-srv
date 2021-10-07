import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';


export enum TRANSACTION_STATUS {
    CREATED = 'Created',

    PAYMENT_PENDING = 'Unpaied',
    PAYMENT_SUCCEED = 'Paied',

    COMPLETED = 'Completed',
    CLOSED = 'Closed',
}

export enum CURRENCY {
    CNY = 'CNY',
}

export enum TRANSACTION_REASON {
    ATTEND_PAIED_ACTIVITY = '预定付费活动',
    ATTEND_FREE_ACTIVITY = '预定免费活动',
    
    GOODS_PURCHASE = '购买物品',
    MEMBERSHIP_PURCHASE = '购买会员',

}

export interface Transaction {
    _id: ObjectId;

    uuid: string;

    title: string;
    reason: TRANSACTION_REASON;

    merchId: ObjectId | string | number;

    fromUser: ObjectId;

    currencyAmount: number;
    currencyType: CURRENCY;

    status: TRANSACTION_STATUS;

    tags: string[];

    [k: string]: any;

    createdAt: Date;
    updatedAt: Date;
}


@singleton()
export class MongoTransaction extends MongoCollection<Transaction> {
    collectionName = 'transactions';

}


export const mongoTransaction = container.resolve(MongoTransaction);
