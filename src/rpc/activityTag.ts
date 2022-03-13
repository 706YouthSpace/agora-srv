import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { RPCMethod } from "./civi-rpc";
import { MongoLiveConfig } from "../db/live-config";
//import logger from '../services/logger';

@singleton()
export class ActivityTagRPCHost extends RPCHost {

    constructor(
        protected mongoLiveConfig: MongoLiveConfig,
    ) {
        super(...arguments);

        this.init();
    }

    async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    @RPCMethod('predefined.get')
    async get() {
        const r = await this.mongoLiveConfig.findOne({_id: 'predefined.eventTags'})
        
       
        return r?.tags;
    }


}
