import { AsyncService } from "@naiverlabs/tskit";
import { container, singleton } from "tsyringe";
import { EventRPCHost } from "./event";
import { GB2260RPCHost } from "./gb2260";
import { MiscRPCHost } from "./misc";
import { SiteRPCHost } from "./site";
import { UserRPCHost } from "./user";
import { ActivityTagRPCHost } from "./activityTag";
import { FileUploadRPCHost } from "./file";


@singleton()
export class App extends AsyncService {

    constructor(
        public rpcMisc: MiscRPCHost,
        public rpcUser: UserRPCHost,
        public rpcGb2260: GB2260RPCHost,
        public rpcSite: SiteRPCHost,
        public rpcActivityTag: ActivityTagRPCHost,
        public rpcFileUpload: FileUploadRPCHost,
        public rpcEvent: EventRPCHost,
    ) {
        super(...arguments);

        this.init().catch((err) => {
            this.emit('error', err);
        });
    }

    override async init() {
        await this.dependencyReady();

        this.emit('ready');
    }

}

export default container.resolve(App);
