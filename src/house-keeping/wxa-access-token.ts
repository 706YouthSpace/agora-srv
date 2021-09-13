import { Config } from "../config";
import { HouseKeeperMongoConfig } from "../db/house-keeper-config";
import { AsyncService, retry } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { WxConfig, WxPlatformService } from "../lib/wechat/wx-platform";
import { ChangeStreamDocument } from "mongodb";

interface WxaConf {
    accessToken: string;
    accessTokenExpiresBefore: Date
};

@singleton()
export class WxaAccessTokenAgent extends AsyncService {

    wxConfig: WxConfig;


    wxaConfigKey: string;

    timer?: NodeJS.Timer;

    constructor(
        protected houseKeepingConfig: HouseKeeperMongoConfig,
        protected config: Config,
        protected wxPlatform: WxPlatformService
    ) {
        super(...arguments);

        this.wxConfig = config.wechat;
        this.wxaConfigKey = `wxa.${this.wxConfig.appId}`;

        this.init();
    }

    async init() {
        await this.dependencyReady();

        this.on('change', (key, changed: ChangeStreamDocument<WxaConf>) => {
            if (key !== this.wxaConfigKey) {
                return;
            }

            const wxaConf = changed.fullDocument;

            this.routine(wxaConf);
        });

        const wxaConf = this.houseKeepingConfig.localGet(this.wxaConfigKey) as any;

        this.routine(wxaConf);

        this.emit('ready');
    }


    @retry(3, 100)
    async refreshAccessToken() {
        const result = await this.wxPlatform.getAccessToken(this.wxConfig.appId, this.wxConfig.appSecret);

        const conf = this.houseKeepingConfig.localGet(this.wxaConfigKey) || {};

        conf.appId = this.wxConfig.appId;
        conf.accessToken = result;
        conf.accessTokenExpiresBefore = new Date(Date.now() + result.expires_in * 1000 * 0.9);

        this.houseKeepingConfig.set(this.wxaConfigKey, conf);

        return conf;
    }


    async routine(wxaConf?: WxaConf) {

        if (wxaConf?.accessTokenExpiresBefore) {
            const actBefore: Date = wxaConf.accessTokenExpiresBefore;

            const ts = actBefore.valueOf();

            const now = Date.now();
            const dt = ts - now;


            if (dt > 0) {

                if (this.timer) {
                    clearTimeout(this.timer);
                }
                this.timer = setTimeout(this.routine.bind(this), dt);

                return;
            }
        }

        await this.refreshAccessToken();
    }
}