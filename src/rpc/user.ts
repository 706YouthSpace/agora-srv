import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { ChangeStreamDocument, ObjectId } from "mongodb";
import _ from "lodash";

import { Pick, RPCMethod } from "./civi-rpc";
import { MongoLiveConfig } from "../db/live-config";
import { WxPlatformService } from "../services/wechat/wx-platform";
import { Config } from "../config";
import { Session } from "./dto/session";
import { MongoUser, User } from "../db/user";
import { MongoEvent, VERIFICATION_STATUS } from "../db/event";
import {
    MongoTransaction, Transaction, TRANSACTION_STATUS, WxSpecificTransactionDetails
} from "../db/transaction";

interface WxaConf {
    appId: string;
    accessToken?: string;
    accessTokenExpiresBefore?: Date;
};

@singleton()
export class UserRPCHost extends RPCHost {

    wxaConfig: WxaConf = {} as any;
    constructor(
        protected mongoLiveConfig: MongoLiveConfig,
        protected config: Config,
        protected wxService: WxPlatformService,
        protected mongoUser: MongoUser,
        protected mongoEvent: MongoEvent,
        protected mongoTransaction: MongoTransaction,
    ) {
        super(...arguments);
        this.init();
    }

    async init() {

        await this.dependencyReady();

        const wxConfig = this.config.wechat;
        const wxaConfigKey = `wxa.${wxConfig.appId}`;
        this.wxaConfig = this.mongoLiveConfig.localGet(wxaConfigKey) || {} as any;
        this.wxaConfig.appId = wxConfig.appId;
        this.mongoLiveConfig.on('change', (key, changeEvent: ChangeStreamDocument) => {
            if (key !== wxaConfigKey) {
                return;
            }

            _.merge(this.wxaConfig, changeEvent.fullDocument);
        });

        this.emit('ready');
    }

    @RPCMethod('user.update')
    async userUpdate(
        session: Session,
        @Pick('avatarUrl') avatarUrl: URL,
        @Pick('nickName') nickName: string,
        @Pick('bio') bio: string
    ) {
        const user = await session.assertUser();

        const patch: Partial<User> = {}
        if (avatarUrl) {
            patch.avatar = avatarUrl.toString();
        }
        if (nickName) {
            patch.nickName = nickName;
        }
        if (bio) {
            patch.bio = bio;
        }
        await this.mongoUser.updateOne({ _id: user._id }, { $set: patch, updatedAt: new Date() });

        const createActList = await this.mongoEvent.simpleFind({
            creatorId: user._id,
            status: VERIFICATION_STATUS.PASSED
        });

        const joinActList = await this.mongoTransaction.simpleFind({
            fromUser: user._id,
            status: TRANSACTION_STATUS.COMPLETED
        });

        return {
            avatarUrl: user.avatar,
            nickName: user.nickName,
            bio: user.bio,

            createActList,
            joinActList
        }
    }

    @RPCMethod('user.get')
    async getUser(
        @Pick('id') id: ObjectId,
    ) {
        const user = await this.mongoUser.get(id)

        const createActList = await this.mongoEvent.simpleFind({
            creatorId: id,
            status: VERIFICATION_STATUS.PASSED
        }).toArray()

        const joinActList = await this.mongoSignUp.collection.find({
            userId: id,
            paid: 'Y'
        }).toArray()

        return {
            // @ts-ignore
            avatarUrl: user.avatarUrl,
            // @ts-ignore
            nickName: user.nickName,
            // @ts-ignore
            bio: user.bio,
            createActList,
            joinActList
        }
    }

    @RPCMethod('user.login')
    async wxaLogin(
        @Pick('code') code: string,
        session: Session,
    ) {
        const loginResult = await this.wxService.wxaLogin(code);

        if (session.__isNew) {
            session.httpSetToken();
        }

        const userResult = await this.mongoUser.upsertByWxOpenId(this.wxaConfig.appId, loginResult.openid, loginResult.unionid);

        if (!userResult.ok) {
            return null;
        }

        const user = userResult.value!;

        const sessionData = await session.fetch();
        sessionData.user = user._id;
        sessionData.wxaSessionKey = loginResult.session_key;

        await session.save();

        return this.mongoUser.sanitize(user);
    }

}
