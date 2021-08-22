import { MongoConfig } from "../db/config";
import { RPCHost } from "tskit";
import { singleton } from "tsyringe";
import { WxPlatformService } from "../lib/wechat/wx-platform";

@singleton()
export class UserRPCHost extends RPCHost {


    constructor(protected mongoConf: MongoConfig, protected wxService: WxPlatformService) {
        super(...arguments);
    }



    
    

}
