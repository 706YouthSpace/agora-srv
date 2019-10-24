import _ from 'lodash';

import { MongoCollection } from '../lib/mongodb/client';
import { ObjectId } from 'mongodb';

export interface WxTplMsgQuota {
    _id?: ObjectId;

    ownerId?: ObjectId;
    ownerWxOpenId?: string;

    wxAppId?: string;

    status?: number;

    expiresBefore?: Date;

    type?: string;

    token?: string;

    quota?: number;

    updatedAt?: number;
    createdAt?: number;
}

export class WxTplMsgQuotaOperations extends MongoCollection<WxTplMsgQuota> {

    addNewQuotaFor(
        wxAppId: string,
        ownerId: string | ObjectId,
        ownerWxOpenId: string,
        token: string,
        type: string = 'form',
        quota: number = 1,
        // tslint:disable-next-line: no-magic-numbers
        ttl: number = 1000 * 3600 * 24 * 7 - 10000) {

        return this.insertOne({
            ownerId: new ObjectId(ownerId),
            ownerWxOpenId,
            wxAppId,
            token,
            type,
            quota,
            expiresBefore: new Date(Date.now() + ttl)
        });

    }

    async consumeOne(ownerWxOpenId: string, type: string = 'form') {
        const quotaRecord = await this.findOneAndUpdate(
            {
                ownerWxOpenId,
                type,
                quota: { $gte: 1 },
                expiresBefore: { $gt: new Date() }
            },
            {
                $inc: { quota: -1 },
                updatedAt: Date.now()
            },
            {
                sort: { expiresBefore: 1 }
            }
        );

        return quotaRecord ? (quotaRecord as WxTplMsgQuota).token : null;
    }

}
