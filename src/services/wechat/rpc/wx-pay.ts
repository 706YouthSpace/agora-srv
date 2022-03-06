import { ApplicationError, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions, Response } from "@naiverlabs/tskit";
import { KeyObject, randomBytes, X509Certificate } from "crypto";
import _ from "lodash";
import { Readable } from "stream";
import { wxPayDecryptJSONObject, wxPayOAEPDecrypt, wxPayOAEPEncrypt, wxPayRSASha256Vefify, wxPaySign } from "./wx-cryptology";
import { WxPayCreateTrasactionDto } from "../dto/wx-pay-wxa";
import { APPLICATION_ERROR } from "../../errors";


export class WxPayCryptologyError extends ApplicationError {
    constructor(detail: any = {}) {
        super(APPLICATION_ERROR.WXPAY_CRYPTOLOGY_ERROR, detail);
    }
}

export interface WxPayRequestOptions extends HTTPServiceRequestOptions {
    bypassSignatureVerification?: boolean;
}


export class WxPayHTTP extends HTTPService<HTTPServiceConfig, WxPayRequestOptions> {

    mchId: string;
    apiV3Key: string;
    rsa2048PrivateKey: KeyObject;
    x509Certificate: X509Certificate;
    platformX509Certificates: X509Certificate[] = [];

    constructor(options: {
        mchId: string,
        apiV3Key: string,
        rsa2048PrivateKey: KeyObject,
        x509Certificate: X509Certificate,
        platformX509Certificates?: X509Certificate[],
        baseUrl?: string;
    }) {
        super(options.baseUrl || 'https://api.mch.weixin.qq.com');

        this.mchId = options.mchId;
        this.apiV3Key = options.apiV3Key;
        this.rsa2048PrivateKey = options.rsa2048PrivateKey;
        this.x509Certificate = options.x509Certificate;

        this.platformX509Certificates.push(...(options.platformX509Certificates || []));

    }

    init() {
        this.on('request', (config: WxPayRequestOptions) => {
            let bodyBuff;
            if (typeof config.body === 'string') {
                bodyBuff = Buffer.from(config.body, 'utf-8');
            } else if (Buffer.isBuffer(config.body)) {
                bodyBuff = config.body;
            } else if (typeof (config.body as any)?.toBuffer === 'function') {
                bodyBuff = (config.body as any).toBuffer();
            } else {
                bodyBuff = Buffer.alloc(0);
            }

            const ts = Math.floor(Date.now() / 1000);
            const nonce = randomBytes(16).toString('hex').toUpperCase();
            const signatureP1 = `${config.method?.toUpperCase() || 'GET'}\n${config.url?.replace(this.baseURL.origin, '')}\n${ts}\n${nonce}\n`;

            const bytesToSign = Buffer.concat([Buffer.from(signatureP1, 'utf-8'), bodyBuff, Buffer.from('\n', 'utf-8')]);

            const signature = wxPaySign(bytesToSign, this.rsa2048PrivateKey).toString('base64');

            const authHeader =
                `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",` +
                `timestamp="${ts}",serial_no="${this.x509Certificate.serialNumber},signature="${signature}"`;

            if (!config.headers) {
                config.headers = {};
            }
            (config.headers as any)['Authorization'] = authHeader;

        });
    }

    decryptJSON<T = any>(obj: any) {
        return wxPayDecryptJSONObject(obj, this.apiV3Key) as T;
    }

    decryptOAEP(data: Buffer, platformCert: X509Certificate) {
        return wxPayOAEPDecrypt(data, platformCert.publicKey);
    }

    encryptOAEP(data: Buffer) {
        return wxPayOAEPEncrypt(data, this.rsa2048PrivateKey);
    }


    async __processResponse(options: WxPayRequestOptions, r: Response) {

        const headers = r.headers;
        const contentType = headers.get('Content-Type');

        let bodyData;

        if (r.ok && !options.bypassSignatureVerification) {
            const serial = headers.get('Wechatpay-Serial');
            if (!serial) {
                throw new WxPayCryptologyError({ message: 'Platform certificate serial not found' });
            }
            const platformCert = this.platformX509Certificates.find((x) => x.serialNumber === serial);
            if (!platformCert) {
                throw new WxPayCryptologyError({ message: 'Platform certificate serial mismatched' });
            }

            bodyData = await r.buffer();

            const stringToSignP1 = `${headers.get('Wechatpay-Timestamp')}\n${headers.get('Wechatpay-Nonce')}\n`;

            const verified = wxPayRSASha256Vefify(
                Buffer.concat([Buffer.from(stringToSignP1, 'utf-8'), bodyData, Buffer.from('\n', 'utf-8')]),
                platformCert.publicKey,
                Buffer.from(headers.get('Wechatpay-Signature') || '', 'base64')
            );

            if (!verified) {
                throw new WxPayCryptologyError({ message: 'Response signature verification failed' });
            }
        } else {
            bodyData = await r.buffer();
        }


        let bodyParsed: any = null;
        do {
            if (options.raw) {
                break;
            }
            if (options.responseType === 'json') {
                bodyParsed = JSON.parse(bodyData.toString());
                break;
            } else if (options.responseType === 'text') {
                bodyParsed = bodyData.toString();
                break;
            } else if (options.responseType === 'buffer') {
                bodyParsed = bodyData;
                break;
            } else if (options.responseType === 'stream') {
                bodyParsed = new Readable();
                bodyParsed.write(bodyData);

                break;
            }
            if (contentType?.startsWith('application/json')) {
                bodyParsed = JSON.parse(bodyData.toString());
            } else if (contentType?.startsWith('text/')) {
                bodyParsed = bodyData.toString();
            }
            break;
            // eslint-disable-next-line no-constant-condition
        } while (false);

        if (r.ok) {
            return bodyParsed === null ? r : bodyParsed;
        }

        throw bodyParsed === null ? r : bodyParsed;
    }

    async getPlatformCertificates() {
        const r = await this.get(
            '/v3/certificates',
            {
                responseType: 'json',
                headers: { 'User-Agent': `${process.title} Node.js ${process.version}` },
                bypassSignatureVerification: true
            }
        );

        this.platformX509Certificates.length = 0;
        const results = r.data.data.map((x: any) => {
            x.encrypt_certificate = this.decryptJSON(x.encrypt_certificate);

            this.platformX509Certificates.push(new X509Certificate(x.encrypt_certificate));

            return x;
        });


        return results as Array<{ serial_no: string; effective_time: string; expire_time: string; encrypt_certificate: string }>;
    }

    async createTransactionJSAPI(options: Partial<WxPayCreateTrasactionDto>) {
        const dto = WxPayCreateTrasactionDto.from<WxPayCreateTrasactionDto>(options);

        const r = await this.postJson('/v3/pay/transactions/jsapi', dto);

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

    parseNotification(data: any) {
        const resource = data.resource;

        wxPayDecryptJSONObject(resource, this.apiV3Key);

        this.emit(`notify-${data.event_type}`, resource, data);

        return {
            code: "SUCCESS",
            message: "成功"
        };
    }
}
