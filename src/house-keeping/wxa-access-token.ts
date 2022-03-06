import { Config } from "../config";
import { MongoLiveConfig } from "../db/live-config";
import { AsyncService, retry } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { ChangeStreamDocument } from "mongodb";
import { WxService } from "services/wechat/wx";

interface WxaConf {
    accessToken: string;
    accessTokenExpiresBefore: Date
};

@singleton()
export class WxaAccessTokenAgent extends AsyncService {

    wxaConfigKey: string;

    timer?: NodeJS.Timer;

    constructor(
        protected mongoLiveConfig: MongoLiveConfig,
        protected config: Config,
        protected wxService: WxService
    ) {
        super(...arguments);

        this.wxaConfigKey = `wxa.${this.config.get('wechat.appId')}`;

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

        const wxaConf = this.mongoLiveConfig.localGet(this.wxaConfigKey) as any;

        this.routine(wxaConf);

        this.emit('ready');
    }


    @retry(3, 100)
    async refreshAccessToken() {
        const result = await this.wxService.getAccessToken();

        const conf: any = this.mongoLiveConfig.localGet(this.wxaConfigKey) || {};

        conf.appId = this.wxService.wxConfig.appId;
        conf.accessToken = result.access_token;
        conf.accessTokenExpiresBefore = new Date(Date.now() + result.expires_in * 1000 * 0.9);

        this.mongoLiveConfig.set(this.wxaConfigKey, conf);

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
