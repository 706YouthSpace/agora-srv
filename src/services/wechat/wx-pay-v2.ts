import { ApplicationError, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions,Response } from "@naiverlabs/tskit";
import { randomBytes,X509Certificate } from "crypto";
import _ from "lodash";
import { APPLICATION_ERROR } from "../errors";
import { Readable } from "stream";
import { wxPayDecryptJSONObject, wxPayOAEPDecrypt, wxPayRSASha256Vefify } from "./wx-cryptology";
import { WxPayCreateTrasactionDto } from "./dto/wx-pay-wxa";
//import { Binary } from "bson";
import { execSync } from "child_process";

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
    apiclientKeyDir: string;
    apiv3Key: Buffer;
    serialNumber: string;
    platformX509Certificates: X509Certificate[] = [];

    constructor(options: {
        mchId: string,
        apiv3Key: Buffer,
        apiclientKeyDir: string,
        serialNumber: string,
        platformX509CertificatesDir: string[],
        baseUrl?: string;
    }) {
        super(options.baseUrl || 'https://api.mch.weixin.qq.com');
        this.mchId = options.mchId;
        this.apiv3Key = options.apiv3Key;
        this.serialNumber = options.serialNumber;
        this.apiclientKeyDir = options.apiclientKeyDir;

        //read pri-key and cert from local files ...
        //this.rsa2048PrivateKey =  KeyObject.from(0 as any); //待调整
        //this.x509Certificate = new X509Certificate(0 as any); //待调整

        this.platformX509Certificates.push(...( []));
        this.init();
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
            const nonce = this.randomString(32); // randomBytes(16).toString('ascii').toUpperCase();
            const signatureP1 = `${config.method?.toUpperCase() || 'POST'}\n${config.url?.replace(this.baseURL.origin, '')}\n${ts}\n${nonce}\n`;

            const bytesToSign = Buffer.concat([Buffer.from(signatureP1, 'utf-8'), bodyBuff, Buffer.from('\n', 'utf-8')]);

            // const signature = wxPaySign(bytesToSign, this.rsa2048PrivateKey).toString('base64');
            console.log("1-bytesToSign:"+bytesToSign);
            const signature = this.doSignShellCmd(bytesToSign.toString().replace(/"/g, '\"'),this.apiclientKeyDir) as any;
            console.log("1-signature:"+signature);
            const authHeader =
                `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",serial_no="${this.serialNumber}",nonce_str="${nonce}",` +
                `timestamp="${ts}",signature="${signature}"`;
            console.log("1-authHeader:"+authHeader);
            //(config.headers as Headers).append('Authorization', authHeader);
            if (!config.headers) {
                config.headers = {};
            }
            (config.headers as any)['Authorization'] = authHeader;

        });
    }

    decryptJSON<T = any>(obj: any) {
        return wxPayDecryptJSONObject(obj, this.apiv3Key) as T;
    }

    decryptOAEP(data: Buffer, platformCert: X509Certificate) {
        return wxPayOAEPDecrypt(data, platformCert.publicKey);
    }

    // encryptOAEP(data: Buffer) {
    //     return wxPayOAEPEncrypt(data, this.rsa2048PrivateKey);
    // }
    randomString(len:number) {
    　　len = len || 32;
        let chars:string = 'ABCDEF123456789';  
        let maxPos = chars.length;
        let pwd = '';
    　　for (let i = 0; i < len; i++) {
    　　　　pwd += chars.charAt(Math.floor(Math.random() * maxPos));
    　　}
   　　return pwd;
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

    async signWxaPayment(appId: string, prepayId: string) {
        const timeStamp = Math.floor(Date.now() / 1000).toString();

        const nonceStr = randomBytes(16).toString('hex').toUpperCase();

        const wxPayPackage = `prepay_id=${prepayId}`;

        const signType = 'RSA';

        const stringToSign = `${appId}\n${timeStamp}\n${nonceStr}\n${wxPayPackage}\n`;
        //const paySign = wxPaySign(Buffer.from(stringToSign), this.rsa2048PrivateKey).toString('base64');
       
        const paySign =this.doSignShellCmd(stringToSign,this.apiclientKeyDir) as any;
        // if(result.code==-1){
        //     return ;
        // }
        
        return {
            timeStamp,
            nonceStr,
            package: wxPayPackage,
            signType,
            paySign
        }
    }

    //
    doSignShellCmd(bytesToSign:string,apiclientKeyDir:string){
        const cmd='echo -n -e \ \"'+bytesToSign+'\" \ | openssl dgst -sha256 -sign '+apiclientKeyDir+' \ | openssl base64 -A' ;
        console.log("cmd: "+cmd);
        return execSync(cmd).toString().trim();
        //let result={code:0, data:''};
        // return new Promise(function(resolve,reject){
        //     exec(str,function(err,stdout,stderr){
        //         if(err){
        //             console.log('err:'+err+'\n stderr:'+stderr);
        //             result.code=-1;
        //             result.data=stderr;
        //             reject(result);
        //         }else{
        //             result.code=1;
        //             result.data=stdout;
        //             resolve(result);
        //         }
        //     })
        // })

    }


}