import { AsyncService } from "@naiverlabs/tskit";
import { container, singleton } from "tsyringe";
import { GB2260RPCHost } from "./gb2260";
import { MiscRPCHost } from "./misc";
import { SiteRPCHost } from "./site";
import { UserRPCHost } from "./user";


@singleton()
export class App extends AsyncService {

    constructor(
        public rpcMisc: MiscRPCHost,
        public rpcUser: UserRPCHost,
        public rpcGb2260: GB2260RPCHost,
        public rpcSite: SiteRPCHost,
    ) {
        super(...arguments);
    }

    load() {
        return 'It does not matter what this function dose. Just to make all RPCHosts be loaded.';
    }

}

export default container.resolve(App);
