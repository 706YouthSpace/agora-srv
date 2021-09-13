import { WxaDecryptedUserInfo } from '../services/wechat/interface';
import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';
import { ObjectId, UpdateFilter } from 'mongodb';

export interface User {
    _id: ObjectId;

    wxOpenId: {
        [appId: string]: string;
    };

    wxUnionId: string[];

    wxUserInfo?: Partial<WxaDecryptedUserInfo>;

    nickName?: string;
    realName?: string;
    avatar?: string | ObjectId;
    bio?: string;

    passwordHash?: string;

    [k: string]: any;

    lastLoggedInAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}


@singleton()
export class MongoUser extends MongoCollection<User> {
    collectionName = 'users';


    findOneByWxOpenId(appId: string, wxOpenId: string) {
        return this.collection.findOne({ [`wxOpenId.${appId}`]: wxOpenId });
    }

    upsertByWxOpenId(appId: string, wxOpenId: string, wxUnionId?: string) {

        const query: UpdateFilter<User> = wxUnionId ? {
            $set: {
                lastLoggedInAt: new Date()
            },
            $addToSet: {
                wxUnionId
            },
            $setOnInsert: {
                createdAt: new Date(),
                updatedAt: new Date()
            }
        } : {
            $set: {
                lastLoggedInAt: new Date()
            },
            $setOnInsert: {
                wxUnionId: [],
                createdAt: new Date(),
                updatedAt: new Date()
            }
        } as any;

        return this.collection.findOneAndUpdate({
            [`wxOpenId.${appId}`]: wxOpenId
        }, query, {
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
