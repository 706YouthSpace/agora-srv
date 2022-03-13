import { WxaDecryptedUserInfo } from '../services/wechat/interface';
import _ from 'lodash';
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';
import { ObjectId, UpdateFilter } from 'mongodb';
import { AutoCastable, Prop } from '@naiverlabs/tskit';

export class User extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ dictOf: String, default: {} })
    wxOpenId!: {
        [appId: string]: string;
    };

    @Prop({ arrayOf: String, required: true })
    wxUnionId!: string[];

    @Prop({ dictOf: Object })
    wxUserInfo?: Partial<WxaDecryptedUserInfo>;

    @Prop()
    nickName?: string;
    @Prop()
    realName?: string;
    @Prop({ type: [ObjectId, String] })
    avatar?: string | ObjectId;
    @Prop()
    bio?: string;

    @Prop()
    passwordHash?: string;

    @Prop()
    lastLoggedInAt?: Date;

    @Prop()
    isAdmin?: boolean;

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;

    toTransferDto() {

        return {
            ...this,
            passwordHash: undefined
        }
    }
}

@singleton()
export class MongoUser extends MongoCollection<User> {
    collectionName = 'users';
    typeclass = User;

    constructor() {
        super(...arguments);

        this.init()
            .catch((err) => this.emit('error', err));
    }

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
