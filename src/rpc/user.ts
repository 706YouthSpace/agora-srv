import { MongoConfig } from "../db/config";
import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { WxPlatformService } from "../services/wechat/wx-platform";
import { Config } from "../config";
import { ChangeStreamDocument } from "mongodb";
import _ from "lodash";
import { ObjectId } from "bson";
import { Pick, RPCMethod } from "./civi-rpc";
import { Session } from "./dto/session";
import { MongoUser } from "../db/user";
import { SessionUser } from "./dto/user";
import { MongoActivities } from "../db/activity";
import { MongoSignUp } from "../db/signUp";

interface WxaConf {
    appId: string;
    accessToken?: string;
    accessTokenExpiresBefore?: Date;
};

@singleton()
export class UserRPCHost extends RPCHost {

    wxaConfig: WxaConf = {} as any;
    constructor(
        protected mongoConf: MongoConfig,
        protected config: Config,
        protected wxService: WxPlatformService,
        protected mongoUser: MongoUser,
        protected mongoActivity: MongoActivities,
        protected mongoSignUp: MongoSignUp,
    ) {
        super(...arguments);
        this.init();
    }

    async init() {

        await this.dependencyReady();

        const wxConfig = this.config.wechat;
        const wxaConfigKey = `wxa.${wxConfig.appId}`;
        this.wxaConfig = this.mongoConf.localGet(wxaConfigKey) || {} as any;
        this.wxaConfig.appId = wxConfig.appId;
        this.mongoConf.on('change', (key, changeEvent: ChangeStreamDocument) => {
            if (key !== wxaConfigKey) {
                return;
            }

            _.merge(this.wxaConfig, changeEvent.fullDocument);
        });

        this.emit('ready');
    }

    @RPCMethod('user.update')
    async userUpdate(
        sessionUser: SessionUser,
        @Pick('avatarUrl') avatarUrl: string,
        @Pick('nickName') nickName: string,
        @Pick('bio') bio: string
    ) {
        const userId = await sessionUser.assertUser();
        if (userId) {

            const update = {}
            if (avatarUrl) {
                // @ts-ignore
                update.avatarUrl = avatarUrl
                // @ts-ignore
                update.nickName = nickName
            }
            if (bio !== undefined) {
                // @ts-ignore
                update.bio = bio
            }
            await this.mongoUser.set(userId,update)
            const user = await this.mongoUser.get(userId)
            
            return user
        }
        return false
    }

    @RPCMethod('user.get')
    async getUser(
        @Pick('id') id: ObjectId,
    ) {
        const user = await this.mongoUser.get(id)

        const createActNum = await this.mongoActivity.collection.find({
            creator: id,
            verified: 'passed'
        }).count()

        const joinActNum = await this.mongoSignUp.collection.find({
            userId: id,
            paid: 'Y'
        }).count()

        return {
            // @ts-ignore
            avatarUrl: user.avatarUrl,
            // @ts-ignore
            nickName: user.nickName,
            // @ts-ignore
            bio: user.bio,
            createActNum,
            joinActNum
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
