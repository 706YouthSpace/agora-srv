// tslint:disable: max-file-line-count
// tslint:disable: no-magic-numbers
import request from 'request';
import xml2js from 'xml2js';
import _ from 'lodash';

import {
    Defer
} from '../../lib/defer';

import {
    wxOpenPlatformSignatureSha1, wxOpenPlatformDecryptB64, wxOpenPlatformEncryptB64,
    wxMiniProgramDecryptB64, wxMiniProgramSignatureSha1
} from './wx-cryptology';

const logger = console;

import { wxErrors } from './wx-errors';
import { retry } from '../../lib/retry-decorator';
import { Readable } from 'stream';
import { singleton } from 'tsyringe';
import { AsyncService, ApplicationError } from '@naiverlabs/tskit';
import { Config } from '../../config';

import * as inf from './interface';
import { WECHAT_API_ACCESS_REALM } from './interface';

const WX_API_BASE_URI = 'https://api.weixin.qq.com';
const RETRY_INTERVAL_MS = 4000;
const OPERATION_TIMEOUT_MS = 3000;

// const SAFTY_PADDING_MS = 5000;
const MAX_TRIES_TWO = 2;

// const COMPONENT_VERIFY_TICKET = 'component-access-ticket';
// const COMPONENT_ACCESS_TOKEN = 'component-access-token';
// const ACCESS_TOKEN = 'access-token';

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

export interface WxConfig {
    appId: string;
    appSecret: string;
    aesEncryptionKey: string;
    signatureToken: string;
    callbackBaseUri: string;

    serviceHosts: string[];
    webviewHosts: string[];
}

export interface WxClientAuthorizedMsg {
    appId: string;
    code: string;
    expiresBefore: number;
    preAuthCode: string;
}

@singleton()
export class WxPlatformService extends AsyncService {

    baseUri: string = WX_API_BASE_URI;

    retryInterval: number = RETRY_INTERVAL_MS;
    timeout: number = OPERATION_TIMEOUT_MS;

    config: WxConfig;

    storage: Map<string, any> = new Map();

    localState: {
        componentVerifyTicket?: string;
        componentAccessToken?: string;
    } = {};

    constructor(
        config: Config
    ) {
        super(...arguments);

        const wxConfig = config.wechat;

        if (!wxConfig) {
            throw new TypeError('Invalid use of WxPlatformService');
        }

        this.config = wxConfig;

        this.init().then(() => this.emit('ready'));
    }

    async init() {
    }

    // _makeComonentAccessTicketClass() {
    //     const key = 'ComponentVerifyTicketClass';
    //     if (this.storage.has(key)) {
    //         return this.storage.get(key);
    //     }
    //     class ComponentAccessTicket extends SharedState {
    //         constructor() {
    //             super();
    //             this.on('error', (err) => {
    //                 logger.error('ComponentVerifiyTicket Error', err);
    //             });
    //         }

    //         next() {
    //             throw new Error('ComponentVerifyTicket could only be received from Wechat. Nothing we could do.');
    //         }
    //     }

    //     this.storage.set(key, ComponentAccessTicket);

    //     return ComponentAccessTicket;
    // }

    // _makeComonentAccessTokenClass() {
    //     const key = 'ComponentAccessTokenClass';
    //     if (this.storage.has(key)) {
    //         return this.storage.get(key);
    //     }
    //     const componentAccessTicket = this.sharedState.create(this._makeComonentAccessTicketClass(), this._keyof(COMPONENT_VERIFY_TICKET));
    //     // tslint:disable-next-line: no-this-assignment
    //     const wxService = this;
    //     class ComponentAccessToken extends SharedState {
    //         async next() {

    //             const currentTicket = await componentAccessTicket.value;
    //             const newTokenReceipt = await wxService.getComponentAccessToken(currentTicket);

    //             return {
    //                 value: newTokenReceipt.component_access_token,
    //                 expiresAt: Date.now() + newTokenReceipt.expires_in * 1000 - SAFTY_PADDING_MS
    //             };
    //         }
    //     }

    //     this.storage.set(key, ComponentAccessToken);

    //     return ComponentAccessToken;
    // }

    // _makeAccessTokenClass() {
    //     const key = 'AccessTokenClass';
    //     if (this.storage.has(key)) {
    //         return this.storage.get(key);
    //     }
    //     // tslint:disable-next-line: no-this-assignment
    //     const wxService = this;
    //     // tslint:disable-next-line: max-classes-per-file
    //     class AccessToken extends SharedState {
    //         async next() {
    //             const newTokenReceipt = await wxService.getAccessToken();

    //             return {
    //                 value: newTokenReceipt.access_token,
    //                 expiresAt: Date.now() + newTokenReceipt.expires_in * 1000 - SAFTY_PADDING_MS
    //             };
    //         }
    //     }

    //     this.storage.set(key, AccessToken);

    //     return AccessToken;
    // }

    _keyof(key: string, clientAppId?: string) {
        if (clientAppId) {
            return `${this.config.appId}-c-${clientAppId}-${key}`;
        }

        return `${this.config.appId}-${key}`;
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

    // receiveNewComponentVerifyTicket(ticketVal: string, validForMs: number = 20 * 60 * 1000) {

    //     throw new Error('Not Implemented');
    //     // return this.sharedState._setState(
    //     //     this._keyof(COMPONENT_VERIFY_TICKET),
    //     //     {
    //     //         value: ticketVal,
    //     //         expiresAt: Date.now() + validForMs
    //     //     }
    //     // );

    // }

    componentAppKickOff() {
        throw new Error('Not Implemented');
        // const componentVerifyTicket = await this.localVerifyTicket;

        // const componentAccessToken = await this.localComponentAccessToken;

        // componentVerifyTicket.on('unlock', (ticket) => {
        //     this.emit('component_verify_ticket', ticket);
        // });

        // this.on('component_verify_ticket', (vlu) => {
        //     this.localState.componentVerifyTicket = vlu;
        //     if (!this.localState.componentAccessToken) {
        //         componentAccessToken.next();
        //     }
        // });

        // componentAccessToken.on('unlock', (vlu) => {
        //     this.emit('component_access_token', vlu);
        // });

        // this.on('component_access_token', (vlu) => {
        //     this.localState.componentAccessToken = vlu;
        //     logger.info('WxPlatform: ComponentAccessToken Is Available');
        // });

        return this;
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

    async _postRequest(url: string, jsonParams?: object, queryParams?: object, raw = false) {
        const deferred = Defer<request.Response>();
        const options: any = {
            json: jsonParams,
            qs: queryParams
        };
        if (raw) {
            options.encoding = null;
        }
        request.post(url, options, (err, response) => {
            if (err) {
                return deferred.reject(err);
            }

            return deferred.resolve(response);
        });
        let result: request.Response;
        try {
            result = await deferred.promise;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
        const rBody = result.body;
        if (rBody && rBody.errcode) {
            const err = new WxPlatformError(rBody);
            this.emit('error', err);
            throw err;
        }

        return rBody;
    }

    async _getRequest(url: string, queryParams?: object, raw = false) {
        const deferred = Defer<request.Response>();
        const options: any = {
            qs: queryParams,
            json: true
        };
        if (raw) {
            options.encoding = null;
        }
        request.get(url, options, (err, response) => {
            if (err) {
                return deferred.reject(err);
            }

            return deferred.resolve(response);
        });
        let result: request.Response;
        try {
            result = await deferred.promise;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }

        const rBody = result.body;
        if (rBody && rBody.errcode) {
            const err = new WxPlatformError(rBody);
            this.emit('error', err);
            throw err;
        }

        return rBody;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async getComponentAccessToken(componentVerifyTicket: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_component_token',
            {
                component_appid: this.config.appId,
                component_appsecret: this.config.appSecret,
                component_verify_ticket: componentVerifyTicket
            }
        );

        return result as inf.WxoComponentAccessTokenReceipt;
    }

    get localComponentAccessToken(): Promise<string> {
        throw new Error('Not Implemented');
    }

    get localAccessToken(): Promise<string> {
        throw new Error('Not Implemented');
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async getAccessToken(appId?: string, appSecret?: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/cgi-bin/token',
            {
                appid: appId || this.config.appId,
                secret: appSecret || this.config.appSecret,
                grant_type: 'client_credential'
            }
        );

        return result as inf.WxoAccessTokenReceipt;
    }

    async getPreAuthCode(pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_create_preauthcode',
            {
                component_appid: this.config.appId
            },
            { component_access_token: componentAccessToken }
        );

        return result as inf.WxoPreAuthCodeReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async getClientAccessToken(clientAuthorizationCode: string, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_query_auth',
            {
                component_appid: this.config.appId,
                authorization_code: clientAuthorizationCode
            },
            { component_access_token: componentAccessToken }
        );

        return result as inf.WxoClientAuthorizationReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async refreshClientAccessToken(clientAppId: string, clientRefreshToken: string, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token',
            {
                component_appid: this.config.appId,
                authorizer_appid: clientAppId,
                authorizer_refresh_token: clientRefreshToken
            },
            { component_access_token: componentAccessToken }
        );

        return result as inf.WxoClientAuthorizationTokenRefreshReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async getClientInfo(clientAppId: string, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_get_authorizer_info',
            {
                component_appid: this.config.appId,
                authorizer_appid: clientAppId
            },
            { component_access_token: componentAccessToken }
        );

        return result as inf.WxoClientInfoReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async getClientOption(clientAppId: string, optionName: string, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_get_authorizer_option',
            {
                component_appid: this.config.appId,
                authorizer_appid: clientAppId,
                option_name: optionName
            },
            { component_access_token: componentAccessToken }
        );

        return result as inf.WxoClientOptionReceipt;
    }

    async setClientOption(clientAppId: string, optionName: string, optionValue: string, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/component/api_get_authorizer_option',

            {
                component_appid: this.config.appId,
                authorizer_appid: clientAppId,
                option_name: optionName,
                option_value: optionValue
            },

            { component_access_token: componentAccessToken }

        );

        return result as inf.WeChatErrorReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async proposeClientAuthorizationQRCode(localRedirectUri: string, bizAppId?: string, authType: string = '2', pComponentAccessToken?: string) {
        const preAuthCode = await this.getPreAuthCode(pComponentAccessToken);
        const bizAddin = bizAppId ? `&biz_appid=${bizAppId}` : '';

        return {
            url: `https://mp.weixin.qq.com/cgi-bin/componentloginpage?` +
                `component_appid=${this.config.appId}&pre_auth_code=${preAuthCode.pre_auth_code}` +
                `&redirect_uri=${encodeURIComponent(this.config.callbackBaseUri + localRedirectUri)}&auth_type=${authType}` +
                `${bizAddin}`,
            preAuthCode: preAuthCode.pre_auth_code,
            ttl: preAuthCode.expires_in
        };
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async proposeClientAuthorizationDirect(localRedirectUri: string, bizAppId?: string, authType: string = '2', pComponentAccessToken?: string) {
        const preAuthCode = await this.getPreAuthCode(pComponentAccessToken);

        const bizAddin = bizAppId ? `&biz_appid=${bizAppId}` : '';

        return {
            url: `https://mp.weixin.qq.com/safe/bindcomponent?` +
                `action=bindcomponent&no_scan=1&component_appid=${this.config.appId}&pre_auth_code=${preAuthCode.pre_auth_code}` +
                `&redirect_uri=${encodeURIComponent(this.config.callbackBaseUri + localRedirectUri)}&auth_type=${authType}` +
                `${bizAddin}`,
            preAuthCode: preAuthCode.pre_auth_code,
            ttl: preAuthCode.expires_in,
            baseUri: this.config.callbackBaseUri
        };
    }


    async wxaClientServerUriOperations(clientAccessToken: string, action?: 'get'): Promise<inf.WxaServerUriReceipt>;
    async wxaClientServerUriOperations(
        clientAccessToken: string,
        action: 'add' | 'delete' | 'set',
        requestDomain?: string | string[],
        wsRequestDomain?: string | string[],
        uploadDomain?: string | string[],
        downloadDomain?: string | string[]
    ): Promise<inf.WxaServerUriReceipt>;

    async wxaClientServerUriOperations(
        clientAccessToken: string,
        _action?: 'add' | 'delete' | 'set' | 'get',
        _requestDomain?: string | string[],
        _wsRequestDomain?: string | string[],
        _uploadDomain?: string | string[],
        _downloadDomain?: string | string[]
    ) {
        const action = _action ? _action : 'get';
        const requestDomain = Array.isArray(_requestDomain) ? _requestDomain : (_requestDomain ? [_requestDomain] : _requestDomain);
        const wsRequestDomain = Array.isArray(_wsRequestDomain) ? _wsRequestDomain : (_wsRequestDomain ? [_wsRequestDomain] : _wsRequestDomain);
        const uploadDomain = Array.isArray(_uploadDomain) ? _uploadDomain : (_uploadDomain ? [_uploadDomain] : _uploadDomain);
        const downloadDomain = Array.isArray(_downloadDomain) ? _downloadDomain : (_downloadDomain ? [_downloadDomain] : _downloadDomain);

        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/modify_domain',
            {
                action,
                requestdomain: requestDomain,
                wsrequestdomain: wsRequestDomain,
                uploaddomain: uploadDomain,
                downloaddomain: downloadDomain
            },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaServerUriReceipt;
    }


    async wxaWebViewWhitelistOperations(
        clientAccessToken: string,
        action?: 'get'
    ): Promise<inf.WxaWebViewWhitelistReceipt>;
    async wxaWebViewWhitelistOperations(
        clientAccessToken: string,
        action: 'add' | 'delete' | 'set',
        webviewDomainWhitelist?: string | string[]
    ): Promise<inf.WxaWebViewWhitelistReceipt>;


    async wxaWebViewWhitelistOperations(
        clientAccessToken: string,
        action?: 'add' | 'delete' | 'set' | 'get',
        _webviewDomainWhitelist?: string | string[]
    ) {
        const webviewDomainWhitelist = Array.isArray(_webviewDomainWhitelist) ? _webviewDomainWhitelist :
            (_webviewDomainWhitelist ? [_webviewDomainWhitelist] : _webviewDomainWhitelist);

        const queryBody: any = {
        };

        if (action) {
            queryBody.action = action;
        }
        if (webviewDomainWhitelist) {
            queryBody.webviewdomain = webviewDomainWhitelist;
        }

        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/setwebviewdomain',
            queryBody,
            { access_token: clientAccessToken }
        );

        return result as inf.WxaWebViewWhitelistReceipt;
    }

    async wxaGetAccountInfo(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/cgi-bin/account/getaccountbasicinfo',
            { access_token: clientAccessToken }
        );

        return result as inf.WxaAccountInfoReceipt;
    }

    async wxaNameModificationPersonal(clientAccessToken: string, idCardMediaId: string, ...otherMediaIds: string[]) {
        const otherStuff = _(otherMediaIds).map((mediaId, indx) => {
            return [`naming_other_stuff_${indx + 1}`, mediaId];
        }).zipObjectDeep().value() || {};

        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/setnickname',
            {
                id_card: idCardMediaId,
                ...otherStuff
            },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaNamingReceipt;
    }

    async wxaNameModificationOrganizational(clientAccessToken: string, licenseMediaId: string, ...otherMediaIds: string[]) {
        const otherStuff = _(otherMediaIds).map((mediaId, indx) => {
            return [`naming_other_stuff_${indx + 1}`, mediaId];
        }).zipObjectDeep().value() || {};

        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/setnickname',
            {
                license: licenseMediaId,
                ...otherStuff
            },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaNamingReceipt;
    }

    async wxaNamingStatus(clientAccessToken: string, auditId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/api_wxa_querynickname',
            { auidit_id: auditId },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaNamingConditionQueryReceipt;
    }

    async wxaNamingPrecheck(clientAccessToken: string, name: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxverify/checkwxverifynickname',
            {
                nick_name: name
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaNamingPrecheckReceipt;
    }

    async wxaModifyAvatar(clientAccessToken: string, avatarMediaId: string, x1: number, y1: number, x2: number, y2: number) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/account/modifyheadimage',
            {
                head_img_media_id: avatarMediaId,
                x1, y1, x2, y2
            },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaModifyDescription(clientAccessToken: string, newDescription: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/account/modifysignature',
            {
                signature: newDescription
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    wxoProposeAdminRebind(clientId: string, redirectUri: string) {
        return `https://mp.weixin.qq.com/wxopen/componentrebindadmin?appid=${clientId}` +
            `&component_appid=${this.config.appId}&redirect_uri=${encodeURI(redirectUri)}`;
    }

    async wxaCompleteAdminRebind(clientAccessToken: string, taskId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/account/componentrebindadmin',
            {
                taskid: taskId
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoGetAllPossibleCategories(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/getallcategories',
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetAllCategoriesReceipt;
    }

    async wxoAddCategories(
        clientAccessToken: string,
        categories: Array<{ first: number; second: number; certicates: Array<{ key: string; value: string }> }>
    ) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/addcategory',
            { categories },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoRemoveCategory(
        clientAccessToken: string,
        firstId: number,
        secondId: number
    ) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/deletecategory',
            { first: firstId, second: secondId },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoModifyCategory(
        clientAccessToken: string,
        category: { first: number; second: number; certicates: Array<{ key: string; value: string }> }
    ) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/modifycategory',
            { ...category },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoGetCurrentCategories(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/getcategory',
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetCurrentCategoriesReceipt;
    }

    async wxaBindTester(clientAccessToken: string, testerId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/bind_tester',
            {
                wechatid: testerId
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaBindTesterReceipt;
    }

    async wxaUnbindTester(clientAccessToken: string, userStr: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/unbind_tester',
            {
                userstr: userStr
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetAllTesters(clientAccessToken: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/memberauth',
            {
                action: "get_experiencer"
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaGetAllTestersReceipt;
    }

    async wxaCodeCommit(
        clientAccessToken: string,
        templateId: number = 0,
        extJson: object = {},
        userVersion: string = '', userDesc: string = ''
    ) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/commit',
            {
                template_id: templateId,
                ext_json: JSON.stringify(extJson),
                user_version: userVersion,
                user_desc: userDesc
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaBetaQR(clientAccessToken: string, path: string = '') {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/get_qrcode',
            {
                access_token: clientAccessToken,
                path
            },
            true
        );

        return result as Buffer;
    }

    async wxaProductionWxaCode(clientAccessToken: string, options: {
        scene: string;
        page?: string;
        width?: number;
        autoColor?: boolean;
        lineColor?: {
            r: string;
            g: string;
            b: string;
        };
        isHyaline?: boolean;
    }) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/getwxacodeunlimit',
            {
                scene: options.scene,
                page: options.page,
                width: options.width,
                auto_color: options.autoColor,
                line_color: options.lineColor,
                is_hyaline: options.isHyaline
            },
            {
                access_token: clientAccessToken
            },
            true
        );

        return result as Buffer;
    }

    async wxaGetAvailableCategories(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/get_category',
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaCodeCategoriesReceipt;
    }

    async wxaListPages(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/get_page',
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaListPagesReceipt;
    }

    async wxaSubmitAudition(
        clientAccessToken: string,
        ...pages: Array<{
            address: string;
            tag: string;
            first_class: string;
            second_class: string;
            first_id: number;
            second_id: number;
            third_class?: string;
            third_id?: string;
            title: string;
        }>
    ) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/submit_audit',
            {
                item_list: pages
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaSubmitReceipt;
    }


    async wxaGetCodeAuditionStatus(clientAccessToken: string, auditId: string | number) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/get_auditstatus',
            { auditid: parseInt(auditId as any, 10) },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaCheckAuditionStatusReceipt;
    }

    async wxaGetLatestCodeAuditionStatus(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/get_latest_auditstatus',
            { access_token: clientAccessToken }
        );

        return result as inf.WxaCheckLatestAuditionStatusReceipt;
    }

    async wxaRelease(clientAccessToken: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/release',
            {},
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaSetProductionVersionVisibility(clientAccessToken: string, visible: boolean) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/change_visitstatus',
            {
                action: visible ? 'open' : 'close'
            },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaCodeRevert(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/revertcoderelease',
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetAPISupportage(clientAccessToken: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/getweappsupportversion',
            {},
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WxaAPISupportageReceipt;
    }

    async wxaSetMinimalAPIVersion(clientAccessToken: string, version: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/setweappsupportversion',
            {
                version
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoQRCodeReferenceRuleOperations(
        clientAccessToken: string,
        rule: {
            prefix: string;
            permit_sub_rule: '1' | '2';
            path: string;
            open_version: '1' | '2' | '3';
            debug_url: string[];
            is_edit: 0 | 1;
        }
    ) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/qrcodejumpadd',
            {
                ...rule
            },
            {
                access_token: clientAccessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoGetAllQRReferenceRules(clientAccessToken: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/qrcodejumpget',
            {},
            { access_token: clientAccessToken }
        );

        return result as inf.WxaQRReferenceReceipt;
    }

    async wxoGetVerificationFile(clientAccessToken: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/qrcodejumpdownload',
            {},
            { access_token: clientAccessToken }
        );

        return result as inf.WxaVerificationFileReceipt;
    }

    async wxoPublishQRReference(clientAccessToken: string, prefix: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/qrcodejumppublish',
            { prefix },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaUndoCodeSubmit(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/undocodeaudit',
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGrayscaleRelease(clientAccessToken: string, percentage: number) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/grayrelease',
            { gray_percentage: percentage },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaRevertGrayscaleRelease(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/revertgrayrelease',
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetGrayscaleReleaseStatus(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/getgrayreleaseplan',
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGrayScaleStatusReceipt;
    }

    async wxaGetAllCodeDrafts(pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/gettemplatedraftlist',
            { access_token: componentAccessToken }
        );

        return result as inf.WxaGetAllCodeDraftsReceipt;
    }

    async wxaGetAllCodeTemplates(pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/gettemplatelist',
            { access_token: componentAccessToken }
        );

        return result as inf.WxaGetAllCodeTemplatesReceipt;
    }

    async wxaComposeCodeTemplate(draftId: number, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/addtotemplate',
            { draft_id: draftId },
            { access_token: componentAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaRemoveFromCodeTemplate(templateId: number, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/deletetemplate',
            { template_id: templateId },
            { access_token: componentAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }


    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async wxaExchangeForSessionKey(appId: string, code: string, pComponentAccessToken?: string) {
        let componentAccessToken = pComponentAccessToken;
        if (!componentAccessToken) {
            componentAccessToken = await this.localComponentAccessToken;
        }
        const result = await this._getRequest(
            'https://api.weixin.qq.com/sns/component/jscode2session',
            {
                appid: appId,
                js_code: code,
                grant_type: 'authorization_code',
                component_appid: this.config.appId,
                component_access_token: componentAccessToken
            }
        );

        return result as inf.WxaLoginReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async wxaLogin(code: string, appId?: string, appSecret?: string) {

        const realAppId = appId || this.config.appId;
        const realAppSecret = appSecret || this.config.appSecret;

        const result = await this._getRequest(
            'https://api.weixin.qq.com/sns/jscode2session',
            {
                appid: realAppId,
                secret: realAppSecret,
                js_code: code,
                grant_type: 'authorization_code'
            }
        );

        return result as inf.WxaLoginReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async wxaComponentLogin(code: string, appId?: string, appSecret?: string) {

        const realAppId = appId || this.config.appId;
        const realAppSecret = appSecret || this.config.appSecret;

        const result = await this._getRequest(
            'https://api.weixin.qq.com/sns/component/jscode2session',
            {
                appid: realAppId,
                secret: realAppSecret,
                js_code: code,
                grant_type: 'authorization_code'
            }
        );

        return result as inf.WxaLoginReceipt;
    }

    async wxoListAllPublicMessageTemplates(clientAccessToken: string, offset = 0, count = 5) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/template/library/list',
            { offset, count },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetAllMessageComponentsReceipt;
    }

    async wxoGetSinglePublicMessageTemplate(clientAccessToken: string, componentId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/template/library/get',
            { id: componentId },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetMessageComponentReceipt;
    }

    async wxoComposeCustomMessageTemplate(clientAccessToken: string, componentId: string, ...keywordIds: number[]) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/template/add',
            {
                id: componentId,
                keyword_id_list: keywordIds
            },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaComposeMessageTemplateReceipt;
    }

    async wxoGetAllCustomMessageTemplates(clientAccessToken: string, offset = 0, count = 20) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/template/list',
            { offset, count },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetAllMessageTemplatesReceipt;
    }

    async wxoRemoveSingleCustomMessageTemplate(clientAccessToken: string, templateId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/wxopen/template/del',
            { template_id: templateId },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoSendTemplateMessage(
        clientAccessToken: string,
        templateId: string,
        toUserOpenId: string,
        token: string,
        data: object,
        emphasizedKeyword?: string,
        wxaref?: string,
    ) {

        const qObj: any = {
            template_id: templateId, touser: toUserOpenId,
            form_id: token,
            data
        };
        if (wxaref) {
            qObj.page = wxaref;
        }
        if (emphasizedKeyword) {
            qObj.emphasis_keyword = emphasizedKeyword;
        }
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/message/wxopen/template/send',
            qObj,
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoCreateAccountAndBindMiniProgram(clientAccessToken: string, appId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/open/create',
            { appid: appId },
            { access_token: clientAccessToken }
        );

        return result as inf.WxoAccountOpsWithAppIdReceipt;
    }

    async wxoBindMiniProgram(clientAccessToken: string, appId: string, wxoId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/open/bind',
            { appid: appId, open_appid: wxoId },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoUnbindMiniProgram(clientAccessToken: string, appId: string, wxoId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/open/unbind',
            { appid: appId, open_appid: wxoId },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetBoundOpenPlatformAccount(clientAccessToken: string, appId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/cgi-bin/open/get',
            { appid: appId },
            { access_token: clientAccessToken }
        );

        return result as inf.WxoAccountOpsWithAppIdReceipt;
    }

    async wxaForbidBeingSearched(clientAccessToken: string, disallowPresenceInSearch = false) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/changewxasearchstatus',
            { status: disallowPresenceInSearch ? 1 : 0 },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaCheckSearchPreference(clientAccessToken: string) {
        const result = await this._getRequest(
            'https://api.weixin.qq.com/wxa/getwxasearchstatus',
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetCurrentSearchPreferenceReceipt;
    }


    async wxaApplyForPlugin(clientAccessToken: string, pluginId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/plugin',
            { action: 'apply', plugin_appid: pluginId },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaListInstalledPlugin(clientAccessToken: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/plugin',
            { action: 'list' },
            { access_token: clientAccessToken }
        );

        return result as inf.WxaGetPluginsReceipt;
    }

    async wxaUninstallPlugin(clientAccessToken: string, pluginId: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/wxa/plugin',
            { action: 'unbind', plugin_appid: pluginId },
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaAnalysisDailySummaryTrend(clientAccessToken: string, beginDate: string, endDate: string) {
        const result = await this._postRequest(
            'https://api.weixin.qq.com/datacube/getweanalysisappiddailysummarytrend',
            { begin_date: beginDate, end_date: endDate },
            { access_token: clientAccessToken }
        );

        return result as {
            list: Array<{
                ref_date: string;
                visit_total: number;
                share_pv: number;
                share_uv: number;
            }>;
        };
    }

    async wxaAnalysisVisitTrend(
        clientAccessToken: string, beginDate: string, endDate: string,
        scale: 'daily' | 'weekly' | 'monthly' = 'daily') {
        const result = await this._postRequest(
            `https://api.weixin.qq.com/datacube/getweanalysisappid${scale}visittrend`,
            { begin_date: beginDate, end_date: endDate },
            { access_token: clientAccessToken }
        );

        return result as {
            list: Array<{
                ref_date: string;
                session_cnt: number;
                visit_pv: number;
                visit_uv: number;
                visit_uv_new: number;
                stay_time_session: number;
                visit_depth: number;
            }>;
        };
    }

    async wxaAnalysisVisitDistribution(
        clientAccessToken: string, beginDate: string, endDate: string
    ) {
        const result = await this._postRequest(
            `https://api.weixin.qq.com/datacube/getweanalysisappidvisitdistribution`,
            { begin_date: beginDate, end_date: endDate },
            { access_token: clientAccessToken }
        );

        return result as {
            ref_date: string;
            list: Array<{
                index: string | 'access_source_session_cnt' | 'access_staytime_info' | 'access_depth_info';
                item_list: Array<{ key: number; value: number; access_source_visit_uv: number }>;
            }>;
        };
    }

    async wxaAnalysisRetainInfo(
        clientAccessToken: string, beginDate: string, endDate: string,
        scale: 'daily' | 'weekly' | 'monthly' = 'daily') {
        const result = await this._postRequest(
            `https://api.weixin.qq.com/datacube/getweanalysisappiddaily${scale}retaininfo`,
            { begin_date: beginDate, end_date: endDate },
            { access_token: clientAccessToken }
        );

        return result as {
            ref_date: string;
            visit_uv_new: Array<{ key: number; value: number }>;
            visit_uv: Array<{ key: number; value: number }>;
        };
    }

    async wxaAnalysisVisitPage(
        clientAccessToken: string, beginDate: string, endDate: string
    ) {
        const result = await this._postRequest(
            `https://api.weixin.qq.com/datacube/getweanalysisappidvisitpage`,
            { begin_date: beginDate, end_date: endDate },
            { access_token: clientAccessToken }
        );

        return result as {
            ref_date: string;
            list: Array<{
                page_path: string;
                page_visit_pv: number;
                page_visit_uv: number;
                page_staytime_pv: number;
                entrypage_pv: number;
                exitpage_pv: number;
                page_share_pv: number;
                page_share_uv: number;
            }>;
        };
    }

    async wxaSendCustomerServiceMessage(
        clientAccessToken: string, toUser: string, msgType: 'text' | 'image' | 'link' | 'miniprogrampage',
        content: string | {
            title: string; description: string; url: string; thumb_url: string;
        } | { title: string; pagepath: string; thumb_meida_id: string }
    ) {

        const qObj: any = {
            touser: toUser,
            msgtype: msgType,
        };

        switch (msgType) {
            case 'text': {
                qObj.text = {
                    content
                };
                break;
            }

            case 'image': {
                qObj.image = {
                    media_id: content
                };
                break;
            }

            case 'link': {
                qObj.link = content;
                break;
            }
            case 'miniprogrampage': {
                qObj.miniprogrampage = content;
                break;
            }

            default: {
                throw new TypeError('Invalid message type');
            }
        }

        const result = await this._postRequest(
            `https://api.weixin.qq.com/cgi-bin/message/custom/send`,
            qObj,
            { access_token: clientAccessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }


    async uploadTemporaryMedia(
        clientAccessToken: string,
        type: 'image' | 'voice' | 'video' | 'thumb',
        dataStream: Readable,
        fileName?: string, mimeType?: string) {
        const deferred = Defer<any>();
        request.post(
            'https://api.weixin.qq.com/cgi-bin/media/upload',
            {
                formData: {
                    media: {
                        value: dataStream,
                        filename: fileName,
                        contentType: mimeType
                    }
                },
                qs: {
                    access_token: clientAccessToken,
                    type
                }
            },
            (err, response) => {
                if (err) {
                    return deferred.reject(err);
                }

                return deferred.resolve(response);
            }
        );
        const result = await deferred.promise;
        const rBody = result.body;
        if (rBody && rBody.errcode) {
            const err = new WxPlatformError(rBody);
            this.emit('error', err);
            throw err;
        }

        return rBody as inf.WeChatMediaUploadReceipt;
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async wxaMediaCheckAsync(
        clientAccessToken: string, mediaUrl: string, type: 'image' | 'audio' = 'image'
    ) {
        const result = await this._postRequest(
            `https://api.weixin.qq.com/wxa/media_check_async`,
            { media_url: mediaUrl, media_type: type === 'audio' ? 2 : 1 },
            { access_token: clientAccessToken }
        );

        return result as {
            trace_id: string;
            errcode: number;
            errmsg: string;
        };
    }

    @retry(MAX_TRIES_TWO, RETRY_INTERVAL_MS)
    async wxaMsgSecCheck(
        clientAccessToken: string, content: string
    ) {
        const result = await this._postRequest(
            `https://api.weixin.qq.com/wxa/msg_sec_check`,
            { content },
            { access_token: clientAccessToken }
        );

        return result as {
            errcode: number;
            errmsg: 'ok' | 'risky';
        };
    }
}

export const WECHAT_API_ACCESS_REALM_NAME_TABLE: { [n: number]: string } = {
    [WECHAT_API_ACCESS_REALM.MESSAGING]: '消息管理权限',
    [WECHAT_API_ACCESS_REALM.USER_MANAGEMENT]: '用户管理权限',
    [WECHAT_API_ACCESS_REALM.ACCOUNT_SERVICE]: '帐号服务权限',
    [WECHAT_API_ACCESS_REALM.WEB_SERVICE]: '网页服务权限',
    [WECHAT_API_ACCESS_REALM.MINI_STORE]: '微信小店权限',
    [WECHAT_API_ACCESS_REALM.CUSTOMER_SUPPORT]: '微信多客服权限',
    [WECHAT_API_ACCESS_REALM.BROADCAST_AND_NOTIFICATION]: '群发与通知权限',
    [WECHAT_API_ACCESS_REALM.CARDS_AND_TICKETS]: '微信卡券权限',
    [WECHAT_API_ACCESS_REALM.QR_SCAN]: '微信扫一扫权限',
    [WECHAT_API_ACCESS_REALM.WIFI]: '微信连WIFI权限',
    [WECHAT_API_ACCESS_REALM.CONTENT_MANAGEMENT]: '素材管理权限',
    [WECHAT_API_ACCESS_REALM.SHAKE_GEO_NEAR]: '微信摇周边权限',
    [WECHAT_API_ACCESS_REALM.OFFLINE_STORE]: '微信门店权限',
    [WECHAT_API_ACCESS_REALM.WEPAY]: '微信支付权限',
    [WECHAT_API_ACCESS_REALM.CUSTOM_MENU]: '自定义菜单权限',
    [WECHAT_API_ACCESS_REALM.WECHAT_VERIFICATION]: '获取认证状态及信息',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_ACCOUNT_MANAGEMENT]: '小程序帐号管理权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_DEVELOPMENT_AND_DATA_ANALYSIS]: '小程序开发管理与数据分析权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_SERVICE_MESSAGING_MANAGEMENT]: '小程序客服消息管理权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_LOGIN]: '小程序微信登录权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_DATA_ANALYSIS]: '小程序数据分析权限',
    [WECHAT_API_ACCESS_REALM.CITY_SERVICE]: '城市服务接口权限',
    [WECHAT_API_ACCESS_REALM.ADVERTISING]: '广告管理权限',
    [WECHAT_API_ACCESS_REALM.OPEN_PLATFORM_ACCOUNT_MANAGEMENT]: '开放平台帐号管理权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_OPEN_PLATFORM_ACCOUNT_MANAGEMENT]: '小程序开放平台帐号管理权限',
    [WECHAT_API_ACCESS_REALM.FAPIAO]: '微信电子发票权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_SET_BASIC_PROFILE]: '小程序基本信息设置权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_NEAR_BY_LOCATIONS]: '小程序附近地点功能权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_PLUGIN_MANAGEMENT]: '小程序插件管理权限',
    [WECHAT_API_ACCESS_REALM.MINI_PROGRAM_EXPRESS_WIDGET_MANAGEMENT]: '小程序搜索widget管理权限',
};

