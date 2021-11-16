import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { RPCMethod } from "./civi-rpc";
import { MongoActivityTag } from "../db/activityTag";

@singleton()
export class ActivityTagRPCHost extends RPCHost {

    constructor(
        protected mongoActivityTag: MongoActivityTag,
    ) {
        super(...arguments);

        this.init();
    }

    async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    @RPCMethod('activityTag.getAll')
    async getAll() {
        const result = await this.mongoActivityTag.getAll();

        return result;
    }


}
