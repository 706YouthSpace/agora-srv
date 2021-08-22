import { AsyncService } from "tskit";
import { container, singleton } from "tsyringe";
import { MiscRPCHost } from "./misc";
import { UserRPCHost } from "./user";


@singleton()
export class App extends AsyncService {

    constructor(
        public rpcMisc: MiscRPCHost,
        public rpcUser: UserRPCHost
    ) {
        super(...arguments);
    }

    load() {
        return 'It does not matter what this function dose. Just to make all RPCHosts be loaded.';
    }

}

export default container.resolve(App);
