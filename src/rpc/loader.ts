import { AsyncService } from "tskit";
import { container, singleton } from "tsyringe";
import { MiscRPCHost } from "./misc";


@singleton()
export class App extends AsyncService {

    constructor(public rpcMisc: MiscRPCHost) {
        super(...arguments);
    }

    sayhi() {
        return 'hi';
    }

}

export default container.resolve(App);
