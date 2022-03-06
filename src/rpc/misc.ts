import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { MongoLiveConfig } from "../db/live-config";
import { Pick, RPCMethod } from "./civi-rpc";
import { Session } from "./dto/session";

@singleton()
export class MiscRPCHost extends RPCHost {

    constructor(
        protected mongoLiveConfig: MongoLiveConfig,
    ) {
        super(...arguments);

        this.dependencyReady().then(() => this.emit('ready'));
    }

    @RPCMethod('misc.ping')
    ping() {
        return 'pone';
    }

    @RPCMethod('misc.getSession')
    async getSession(session: Session) {

        const data = await session.fetch();

        session.httpSetToken();

        return { wtf: 1, ...data };
    }

    @RPCMethod('misc.getPredefined')
    async getPredefined(@Pick('key', { required: true }) key: string) {
        const r = await this.mongoLiveConfig.findOne({ _id: `predefined:${key}` })

        return r;
    }
}
