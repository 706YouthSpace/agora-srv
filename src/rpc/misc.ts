import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { RPCMethod } from "./civi-rpc";
import { Session } from "./dto/session";

@singleton()
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
