import { ResourceNotFoundError, RPCHost } from "@naiverlabs/tskit";
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

    @RPCMethod('predefined.get')
    async getPredefinedEventTags(
        @Pick('key', { required: true }) key: string,
    ) {

        const k = key.split(/[:.]/).join(':');

        const r = this.mongoLiveConfig.localGet(`predefined:${k}`);

        if (r === undefined) {
            throw new ResourceNotFoundError(`predefined(${k})`);
        }

        return r?.data;
    }
}
