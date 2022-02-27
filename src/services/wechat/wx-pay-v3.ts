import { Wechatpay,Rsa,Aes } from "wechatpay-axios-plugin";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { WxPayCreateTrasactionDto } from "./dto/wx-pay-wxa";
import {  BinaryLike } from 'crypto'

// 平台证书，可由下载器 `wxpay crt -m {商户号} -s {商户证书序列号} -f {商户API私钥文件路径} -k {APIv3密钥(32字节)} -o {保存地址}`
// 载器生成并假定保存为 `/path/to/wechatpay/cert.pem`
//const platformCertificateFilePath = '/path/to/wechatpay/cert.pem';
//const platformCertificateInstance = readFileSync(platformCertificateFilePath);
// 平台证书序列号，下载器下载后有提示序列号字段，也可由命令行
// openssl x509 -in /path/to/wechatpay/cert.pem -noout -serial | awk -F= '{print $2}'
//const platformCertificateSerial = '平台证书序列号';
// const wxpay = new Wechatpay({
//   mchid: merchantId, // 商户号
//   serial: merchantCertificateSerial, // 商户证书序列号
//   privateKey: readFileSync(merchantPrivateKeyFilePath), 
//   certs: { [platformCertificateSerial]: platformCertificateInstance, }
// });

// export interface  param={
//             appid: config.wechat.appId,
//             mchid: config.wechat.mchid,
//             description: signUpInfo[0].activities_info.title,
//             out_trade_no: outTradeNo ,
//             notify_url: config.wechat.notifyUrl,
//             amount: {total:signUpInfo[0].activities_info.pricing *100 }, // 订单总金额，单位为分
//             payer: {openid: openId}

//         } ;

export interface ExecWxPayResult {
        prepay_id: string
}

export class WxPayHTTPv3 {
        wxpay: Wechatpay;
        constructor(options: {
                mchId: string,
                apiv3Key: Buffer,
                apiclientKeyDir: string,
                serialNumber: string,
                platformCertificateFilePath: string,
                platformCertificateSerial: string,
                baseUrl?: string;
        }) {
                this.wxpay = new Wechatpay({
                        mchid: options.mchId, // 商户号
                        serial: options.serialNumber, // 商户证书序列号
                        privateKey: readFileSync(options.apiclientKeyDir),
                        certs: { [options.platformCertificateSerial]: readFileSync(options.platformCertificateFilePath) } 
                });

        }
        async execWxPay(options: Partial<WxPayCreateTrasactionDto>) {
                const dto = WxPayCreateTrasactionDto.from<WxPayCreateTrasactionDto>(options);
                //let rst:ExecWxPayResult=new ExecWxPayResult({prepay_id: ""});
                //let rst = { prepay_id: "" };
                const res= await this.wxpay.v3.pay.transactions.jsapi.post({
                                mchid: dto.mchid,
                                out_trade_no: dto.out_trade_no,
                                appid: dto.appid,
                                description: dto.description,
                                notify_url: dto.notify_url,
                                amount: dto.amount,
                                payer:dto.payer
                        }) ;
                // console.log(res);
                // console.log("res.data: ");
                // console.log(res.data);
                return res ; // res.data
                        // .then((data: any) => {
                        //         console.info(data);
                        //         return data.data as { prepay_id: string };
                        // })
                        // .catch((response: any) => {
                        //         console.error(response);
                        //         return  { prepay_id: "" };
                        // })
               // return rst;
        }

        doSignShellCmd(bytesToSign:string,apiclientKeyDir:string){
                const cmd='echo -n -e \"'+bytesToSign+'\" | openssl dgst -sha256 -sign '+apiclientKeyDir+' | openssl base64 -A' ;
                console.log("cmd: "+cmd);
                return execSync(cmd).toString().trim();
        }

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

        rsaSign(message: string, privateKeyDir: string){
                const privateKey=readFileSync(privateKeyDir);
                return Rsa.sign(message,privateKey);
        }

        decryptAES_GCM( key: string, ciphertext: string, aad?: string){
                let iv:ArrayBuffer=new ArrayBuffer(16);
               const data= Aes.AesGcm.decrypt(iv as BinaryLike,key,ciphertext,aad);
               return JSON.parse(data) ;
        }
}