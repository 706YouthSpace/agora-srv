import { ApplicationError, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions } from "@naiverlabs/tskit";
import { KeyObject,randomBytes,X509Certificate } from "crypto";
import _ from "lodash";
import { APPLICATION_ERROR } from "../errors";
import { wxPayDecryptJSONObject, wxPayOAEPDecrypt,  wxPaySign } from "./wx-cryptology";
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
    rsa2048PrivateKey: KeyObject;
    apiv3Key: Buffer;
    constructor(options: {
        apiv3Key: Buffer,
        rsa2048PrivateKey: KeyObject,
        baseUrl?: string;
    }) {
        super(options.baseUrl || 'https://api.mch.weixin.qq.com');
        this.apiv3Key = options.apiv3Key;
        this.rsa2048PrivateKey = options.rsa2048PrivateKey;
    }

    init() {
        
    }

    decryptJSON<T = any>(obj: any) {
        return wxPayDecryptJSONObject(obj, this.apiv3Key) as T;
    }

    decryptOAEP(data: Buffer, platformCert: X509Certificate) {
        return wxPayOAEPDecrypt(data, platformCert.publicKey);
    }

    async getPlatformCertificates() {
        const r = await this.get(
            '/v3/certificates',
            {
                responseType: 'json',
                headers: { 'User-Agent': `${process.title} Node.js ${process.version}` },
                bypassSignatureVirification: true
            }
        );

        const results = r.data.data.map((x: any) => {
            x.encrypt_certificate = this.decryptJSON(x.encrypt_certificate);

            return x;
        });


        return results as Array<{ serial_no: string; effective_time: string; expire_time: string; encrypt_certificate: string }>;
    }

    async createTransactionJSAPI(options: Partial<WxPayCreateTrasactionDto>) {
        const dto = WxPayCreateTrasactionDto.from<WxPayCreateTrasactionDto>(options);

        const r = await this.postJson('/v3/pay/transactions/jsapi',  dto);

        return r.data as { prepay_id: string };
    }

    signWxaPayment(appId: string, prepayId: string) {
        const timeStamp = Math.floor(Date.now() / 1000).toString();

        const nonceStr = randomBytes(16).toString('hex').toUpperCase();

        const wxPayPackage = `prepay_id=${prepayId}`;

        const signType = 'RSA';

        const stringToSign = `${appId}\n${timeStamp}\n${nonceStr}\n${wxPayPackage}\n`;
        const paySign = wxPaySign(Buffer.from(stringToSign), this.rsa2048PrivateKey).toString('base64');

        return {
            timeStamp,
            nonceStr,
            package: wxPayPackage,
            signType,
            paySign
        }
    }


}