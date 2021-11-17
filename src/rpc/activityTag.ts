import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { RPCMethod } from "./civi-rpc";
import { MongoActivityTag } from "../db/activityTag";
//import logger from '../services/logger';

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

    @RPCMethod('activityTag.get')
    async get() {
        const query: any = {};
        const result = await this.mongoActivityTag.collection.find(query).toArray();
       
        return result;
    }


}
