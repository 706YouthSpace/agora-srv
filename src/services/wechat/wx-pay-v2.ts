import { ApplicationError, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions } from "@naiverlabs/tskit";
import { X509Certificate } from "crypto";
import _ from "lodash";
import { APPLICATION_ERROR } from "../errors";
import {  wxPayOAEPDecrypt } from "./wx-cryptology";
import { WxPayCreateTrasactionDto } from "./dto/wx-pay-wxa";


export class WxPayCryptologyError extends ApplicationError {
    constructor(detail: any = {}) {
        super(APPLICATION_ERROR.WXPAY_CRYPTOLOGY_ERROR, detail);
    }
}

export interface WxPayRequestOptions extends HTTPServiceRequestOptions {
    bypassSignatureVirification?: boolean;
}


export class WxPayHTTP extends HTTPService<HTTPServiceConfig, WxPayRequestOptions> {

    constructor(options: {
    
        baseUrl?: string;
    }) {
        super(options.baseUrl || 'https://api.mch.weixin.qq.com');

    }

    init() {
        
    }

    decryptOAEP(data: Buffer, platformCert: X509Certificate) {
        return wxPayOAEPDecrypt(data, platformCert.publicKey);
    }

    async createTransactionJSAPI(options: Partial<WxPayCreateTrasactionDto>) {
        const dto = WxPayCreateTrasactionDto.from<WxPayCreateTrasactionDto>(options);

        const r = await this.postJson('/v3/pay/transactions/jsapi',  dto);

        return r.data as { prepay_id: string };
    }



}