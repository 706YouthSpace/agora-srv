import { RPCHost } from "tskit";
import { RPCMethod } from "./civi-rpc";
import { Session } from "./params/session";

export class MiscRPCHost extends RPCHost {

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
}
