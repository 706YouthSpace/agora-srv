import { MongoConfig } from "../db/config";
import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { WxPlatformService } from "../lib/wechat/wx-platform";
import { Config } from "../config";
import { ChangeStreamDocument } from "mongodb";
import _ from "lodash";
import { Pick, RPCMethod } from "./civi-rpc";
import { Session } from "./dto/session";
import { MongoUser } from "../db/user";

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
        protected mongoUser: MongoUser
    ) {
        super(...arguments);

    }

    async init() {
        const wxConfig = this.config.wechat;
        const wxaConfigKey = `wxa.${wxConfig.appId}`;

        await this.dependencyReady();

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

        await session.save();

        return this.mongoUser.sanitize(user);
    }

}
