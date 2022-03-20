import { readFile } from "fs/promises";
import { createPrivateKey, X509Certificate } from "crypto";
import xml2js from 'xml2js';

import { AsyncService, Defer } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { WxClientAuthorizedMsg, WxHTTP } from "./rpc/wx-http";
import { WxPayHTTP } from "./rpc/wx-pay";

import { Config } from '../../config';
import globalLogger from '../logger';
import logger from "../logger";
import {
    wxOpenPlatformEncryptB64,
    wxOpenPlatformSignatureSha1,
    wxOpenPlatformDecryptB64,
    wxMiniProgramDecryptB64,
    wxMiniProgramSignatureSha1
} from "./rpc/wx-cryptology";
import { WxPayCreateRefundDto, WxPayCreateTransactionDto } from "./dto/wx-pay-wxa";
import { MongoLiveConfig } from "../../db/live-config";

export interface WxConfig {
    appId: string;
    appSecret: string;
    aesEncryptionKey: string;
    signatureToken: string;

    serviceHosts?: string[];
    webviewHosts?: string[];
}

export interface WxPayConfig {
    mchId: string;
    apiV3Key: string;
    certPath: string;
    keyPath: string;
    notifyUrl: string;
}

@singleton()
export class WxService extends AsyncService {

    wxPlatform!: WxHTTP;
    wxPay!: WxPayHTTP;

    logger = globalLogger.child({ service: 'wxService' });

    wxConfig!: WxConfig;
    wxPayConfig!: WxPayConfig;

    accessToken!: string;

    constructor(
        protected config: Config,
        protected liveConfig: MongoLiveConfig,
    ) {
        super(...arguments);

        this.wxPlatform = new WxHTTP();

        const tokenWatcher = this.liveConfig.watch(this.wxaConfigKey);

        tokenWatcher.on('changed', (doc) => {
            this.accessToken = doc.accessToken;
        });

        this.init().catch((err) => {
            this.emit('error', err);
        });
    }

    get wxaConfigKey() {
        return `wxa.${this.config.get('wechat.appId')}`;
    }

    async init() {
        await this.dependencyReady();

        this.wxConfig = this.config.wechat;

        this.accessToken = this.liveConfig.localGet(this.wxaConfigKey)?.accessTokens;

        this.wxPayConfig = this.config.get('wechat.pay') as {
            mchId: string;
            apiV3Key: string;
            certPath: string;
            keyPath: string;
            notifyUrl: string;
        };

        const certPem = await readFile(this.wxPayConfig.certPath);
        const keyPem = await readFile(this.wxPayConfig.keyPath);

        this.wxPay = new WxPayHTTP({
            mchId: this.wxPayConfig.mchId,
            apiV3Key: this.wxPayConfig.apiV3Key,
            x509Certificate: new X509Certificate(certPem),
            rsa2048PrivateKey: createPrivateKey(keyPem),
        });

        await this.wxPay.getPlatformCertificates();

        this.emit('ready');
    }

    getAccessToken() {
        return this.wxPlatform.getAccessToken(this.wxConfig.appId, this.wxConfig.appSecret);
    }

    createWxPayTransaction(input: Partial<WxPayCreateTransactionDto>) {
        const params = {
            appid: this.wxConfig.appId,
            mchid: this.wxPay.mchId,
            time_expire: new Date(Date.now() + (3600 * 1000)),
            notify_url: this.wxPayConfig.notifyUrl,
            ...input
        }

        return this.wxPay.createTransactionJSAPI(params);
    }

    createWxPayRefund(input: Partial<WxPayCreateRefundDto>) {
        const params = {
            notify_url: this.wxPayConfig.notifyUrl,
            ...input
        }

        return this.wxPay.createRefund(params);
    }

    async parseIncomingXmlString(xmlString: string) {
        const deferred = Defer<any>();
        xml2js.parseString(
            xmlString,
            {
                explicitArray: false,
                explicitRoot: false,
                trim: true
            },
            (err, result) => {
                if (err) {
                    return deferred.reject(err);
                }

                return deferred.resolve(result);
            }
        );

        return deferred.promise;
    }

    buildXmlReplyMessage(data: object) {
        const builder = new xml2js.Builder({
            cdata: true,
            headless: true
        });

        return builder.buildObject({ xml: data });
    }

    buildEncryptedXmlReplyMessage(
        data: object, timestamp: string | number, nonce: string | number,
        overrideAppId?: string
    ) {
        const toBeEncrypted = this.buildXmlReplyMessage(data);
        const encrypted = wxOpenPlatformEncryptB64(
            toBeEncrypted,
            this.config.aesEncryptionKey,
            overrideAppId || this.config.appId
        );

        const l2Message = {
            Encrypt: encrypted,
            MsgSignature: wxOpenPlatformSignatureSha1(this.config.signatureToken, `${timestamp}`, `${nonce}`, encrypted),
            TimeStamp: `${timestamp}`,
            Nonce: `${nonce}`
        };

        return this.buildXmlReplyMessage(l2Message);
    }

    async parseEncryptedIncomingXmlString(xmlString: string) {
        const l1Parsed = await this.parseIncomingXmlString(xmlString);
        if (!l1Parsed.Encrypt) {
            return l1Parsed;
        }
        const [decryptedXmlString, appid] = wxOpenPlatformDecryptB64(l1Parsed.Encrypt, this.config.aesEncryptionKey);
        const decrypted = await this.parseIncomingXmlString(decryptedXmlString);
        Object.assign(l1Parsed, decrypted);
        l1Parsed.AppId = appid;

        return l1Parsed;
    }

    parseEncryptedMiniProgramJSONString(jsonString: string, sessionKey: string, iv: string) {
        const parsedJsObj = wxMiniProgramDecryptB64(jsonString, sessionKey, iv);

        return parsedJsObj;
    }

    verifyMiniProgramRawDataSignature(signature: string, rawData: string, sessionKey: string) {
        return signature === wxMiniProgramSignatureSha1(rawData, sessionKey);
    }

    wxoDataSignature(timestamp: string, nonce: string, data: string) {
        return wxOpenPlatformSignatureSha1(this.config.signatureToken, timestamp, nonce, data);
    }

    verifyOpenPlatformQuerySignature(signature: string, timestamp: string, nonce: string) {
        return signature === wxOpenPlatformSignatureSha1(this.config.signatureToken, timestamp, nonce);
    }

    async handleOpenPlatformIncomingMessage(message: any) {
        if (message.AppId && message.AppId !== this.config.appId) {
            return;
        }
        logger.info(`Incoming wxOpenPlatformMessage: ${message.InfoType}`, message);
        try {
            switch (message.InfoType) {
                case 'component_verify_ticket': {
                    if (!message.ComponentVerifyTicket) {
                        break;
                    }
                    // await this.receiveNewComponentVerifyTicket(message.ComponentVerifyTicket);

                    break;
                }

                case 'authorized': {
                    const authorizedMsg: WxClientAuthorizedMsg = {
                        appId: message.AuthorizerAppid,
                        code: message.AuthorizationCode,
                        expiresBefore: parseInt(message.AuthorizationCodeExpiredTime, 10) * 1000,
                        preAuthCode: message.PreAuthCode
                    };
                    this.emit('clientAuthorized', authorizedMsg);
                    break;
                }

                case 'unauthorized': {
                    this.emit('clientUnauthorized', message.AuthorizerAppid);
                    break;
                }

                case 'updateauthorized': {
                    const authorizedMsg: WxClientAuthorizedMsg = {
                        appId: message.AuthorizerAppid,
                        code: message.AuthorizationCode,
                        expiresBefore: parseInt(message.AuthorizationCodeExpiredTime, 10) * 1000,
                        preAuthCode: message.PreAuthCode
                    };
                    this.emit('clientAuthorized', authorizedMsg);
                    break;
                }

                default: {
                    void 0;
                }
            }
        } catch (err) {
            this.emit('err', err);

            return null;
        }

        return undefined;
    }

    async handleOpenPlatformClientIncomingMessage(message: any) {
        let msgType = message.MsgType;
        if (msgType === 'event') {
            msgType = message.Event;
        }
        logger.info(`Incoming wxOpenPlatformClientMessage: ${msgType}`, { from: message.FromUserName, to: message.ToUserName });
        try {
            switch (msgType) {
                case 'weapp_audit_success': {
                    this.emit('wxaAuditionSucceeded', message);
                    break;
                }

                case 'weapp_audit_fail': {
                    this.emit('wxaAuditionFailed', message);
                    break;
                }

                case 'wxa_media_check': {
                    this.emit('wxaMediaChecked', message);
                    break;
                }

                case 'user_enter_tempsession': {
                    this.emit('sessionEnter', message);
                    break;
                }

                case 'text': {
                    this.emit('text', message);
                    break;
                }

                case 'image': {
                    this.emit('image', message);
                    break;
                }

                case 'miniprogrampage': {
                    this.emit('wxaPage', message);
                    break;
                }

                default: {
                    void 0;
                }
            }
        } catch (err) {
            this.emit('err', err);

            return null;
        }

        return undefined;
    }

    wxPaySign(pkg: { [k: string]: any }) {
        return this.wxPay.signWxaPayment(this.wxConfig.appId, pkg)
    }

    wxaLogin(code: string) {
        return this.wxPlatform.wxaLogin(code, this.wxConfig.appId, this.wxConfig.appSecret);
    }
}
