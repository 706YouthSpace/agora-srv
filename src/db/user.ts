import { WxaDecryptedUserInfo } from '../lib/wechat/interface';
import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';
import { ObjectId } from 'mongodb';

export interface User {
    _id: ObjectId;

    wxOpenId?: string;
    wxUnionId?: string;
    wxUserInfo?: Partial<WxaDecryptedUserInfo>;

    passwordHash?: string;

    [k: string]: any;

    lastLoggedInAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}


@singleton()
export class MongoUser extends MongoCollection<User> {
    collectionName = 'users';


    findOneByWxOpenId(wxOpenId: string) {
        return this.collection.findOne({ wxOpenId });
    }

    upsertByWxOpenId(wxOpenId: string, wxUnionId?: string) {
        return this.collection.findOneAndUpdate({
            wxOpenId
        }, {
            $set: {
                lastLoggedInAt: new Date(),
                wxUnionId
            },
            $setOnInsert: {
                createdAt: new Date(),
                updatedAt: new Date()
            }
        }, {
            returnDocument: 'after',
            upsert: true,
        });
    }

    sanitize(doc: User) {
        return _.omit(doc, [
            'passwordHash'
        ]);
    }

}

export const mongoUser = container.resolve(MongoUser);
