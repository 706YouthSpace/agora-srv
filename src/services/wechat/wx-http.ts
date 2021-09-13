import { ApplicationError, HTTPService, HTTPServiceConfig } from "@naiverlabs/tskit";
import * as inf from './interface';
import { wxErrors } from "./wx-errors";


export class WxPlatformError extends ApplicationError {
    err: inf.WeChatErrorReceipt;
    localKnowledge?: string;
    constructor(err: inf.WeChatErrorReceipt) {
        super(40004, err);
        this.err = err;
        if (err.errcode) {
            this.localKnowledge = wxErrors[err.errcode];
        }
    }
}


export class WxHTTP extends HTTPService {

    constructor(baseUrl: string = 'https://api.weixin.qq.com', config: HTTPServiceConfig = {}) {
        super(baseUrl, config);
    }



}