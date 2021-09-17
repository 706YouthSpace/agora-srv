import { ApplicationError, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions, Response, Headers } from "@naiverlabs/tskit";
import { KeyObject, randomBytes, X509Certificate } from "crypto";
import _ from "lodash";
import { APPLICATION_ERROR } from "services/errors";
import { Readable } from "stream";
import { wxPayDecryptJSONObject, wxPayOAEPDecrypt, wxPayOAEPEncrypt, wxPayRSASha256Vefify, wxPaySign } from "./wx-cryptology";


export class WxPayCryptologyError extends ApplicationError {
    constructor(detail: any = {}) {
        super(APPLICATION_ERROR.WXPAY_CRYPTOLOGY_ERROR, detail);
    }
}

export interface WxPayRequestOptions extends HTTPServiceRequestOptions {
    bypassSignatureVirification?: boolean;
}

export class WxPayHTTP extends HTTPService<HTTPServiceConfig, WxPayRequestOptions> {

    mchId: string;
    apiv3Key: Buffer;
    rsa2048PrivateKey: KeyObject;
    x509Certificate: X509Certificate;
    platformX509Certificates: X509Certificate[] = [];

    constructor(options: {
        mchId: string,
        apiv3Key: Buffer,
        rsa2048PrivateKey: KeyObject,
        x509Certificate: X509Certificate,
        platformX509Certificates: X509Certificate[],
        baseUrl?: string;
    }) {
        super(options.baseUrl || 'https://api.mch.weixin.qq.com');

        this.mchId = options.mchId;
        this.apiv3Key = options.apiv3Key;
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
            const nonce = randomBytes(16).toString('ascii').toUpperCase();
            const signatureP1 = `${config.method?.toUpperCase() || 'GET'}\n${config.url?.replace(this.baseURL.origin, '')}\n${ts}\n${nonce}\n`;

            const bytesToSign = Buffer.concat([Buffer.from(signatureP1, 'utf-8'), bodyBuff, Buffer.from('\n', 'utf-8')]);

            const signature = wxPaySign(bytesToSign, this.rsa2048PrivateKey).toString('base64');

            const authHeader =
                `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",` +
                `timestamp="${ts}",serial_no="${this.x509Certificate.serialNumber},signature="${signature}"`;

            (config.headers as Headers).set('Authorization', authHeader);

        });
    }

    decryptJSON<T = any>(obj: any) {
        return wxPayDecryptJSONObject(obj, this.apiv3Key) as T;
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

        if (r.ok && !options.bypassSignatureVirification) {
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
            undefined,
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
}