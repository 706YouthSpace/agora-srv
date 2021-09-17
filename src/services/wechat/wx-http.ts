import { ApplicationError, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions, retry } from "@naiverlabs/tskit";
import _ from "lodash";
import { Readable } from "stream";
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

const RETRY_INTERVAL_MS = 1500;
const RETRY_TIMES = 2;
export class WxHTTP extends HTTPService {

    constructor(baseUrl: string = 'https://api.weixin.qq.com', config: HTTPServiceConfig = {}) {
        super(baseUrl, config);
    }

    async __processResponse(config: HTTPServiceRequestOptions, resp: any) {
        const parsed = await super.__processResponse(config, resp);

        if (_.isPlainObject(parsed) && parsed.errcode) {
            const err = new WxPlatformError(parsed);

            throw err;
        }

        return parsed;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async getComponentAccessToken(appId: string, appSecret: string, componentVerifyTicket: string) {
        const result = await this.postJson(
            '/cgi-bin/component/api_component_token', undefined,
            {
                component_appid: appId,
                component_appsecret: appSecret,
                component_verify_ticket: componentVerifyTicket
            }
        );

        return result as inf.WxoComponentAccessTokenReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async getAccessToken(appId: string, appSecret: string) {
        const result = await this.get(
            '/cgi-bin/token',
            {
                appid: appId,
                secret: appSecret,
                grant_type: 'client_credential'
            }
        );

        return result as inf.WxoAccessTokenReceipt;
    }


    async getPreAuthCode(componentAppId: string, componentAccessToken: string) {

        const result = await this.postJson(
            '/cgi-bin/component/api_create_preauthcode',
            { component_access_token: componentAccessToken },
            {
                component_appid: componentAppId
            }
        );

        return result as inf.WxoPreAuthCodeReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async getClientAccessToken(componentAppId: string, clientAuthorizationCode: string, componentAccessToken: string) {

        const result = await this.postJson(
            '/cgi-bin/component/api_query_auth',
            { component_access_token: componentAccessToken },
            {
                component_appid: componentAppId,
                authorization_code: clientAuthorizationCode
            }
        );

        return result as inf.WxoClientAuthorizationReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async refreshClientAccessToken(
        componentAppId: string,
        clientAppId: string, clientRefreshToken: string, componentAccessToken: string
    ) {

        const result = await this.postJson(
            '/cgi-bin/component/api_authorizer_token',
            { component_access_token: componentAccessToken },
            {
                component_appid: componentAppId,
                authorizer_appid: clientAppId,
                authorizer_refresh_token: clientRefreshToken
            }
        );

        return result as inf.WxoClientAuthorizationTokenRefreshReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async getClientInfo(
        componentAppId: string,
        clientAppId: string, componentAccessToken: string) {
        const result = await this.postJson(
            '/cgi-bin/component/api_get_authorizer_info',
            { component_access_token: componentAccessToken },
            {
                component_appid: componentAppId,
                authorizer_appid: clientAppId
            }
        );

        return result as inf.WxoClientInfoReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async getClientOption(
        componentAppId: string, clientAppId: string, optionName: string, componentAccessToken: string) {
        const result = await this.postJson(
            '/cgi-bin/component/api_get_authorizer_option',
            { component_access_token: componentAccessToken },
            {
                component_appid: componentAppId,
                authorizer_appid: clientAppId,
                option_name: optionName
            }
        );

        return result as inf.WxoClientOptionReceipt;
    }

    async setClientOption(
        componentAppId: string, clientAppId: string, optionName: string, optionValue: string, componentAccessToken: string) {
        const result = await this.postJson(
            '/cgi-bin/component/api_get_authorizer_option',
            { component_access_token: componentAccessToken },
            {
                component_appid: componentAppId,
                authorizer_appid: clientAppId,
                option_name: optionName,
                option_value: optionValue
            },


        );

        return result as inf.WeChatErrorReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async proposeClientAuthorizationQRCode(componentAppId: string, componentAccessToken: string, redirectUri: string, bizAppId?: string, authType: string = '2',) {
        const preAuthCode = await this.getPreAuthCode(componentAppId, componentAccessToken);
        const bizAddin = bizAppId ? `&biz_appid=${bizAppId}` : '';

        return {
            url: `https://mp.weixin.qq.com/cgi-bin/componentloginpage?` +
                `component_appid=${componentAppId}&pre_auth_code=${preAuthCode.pre_auth_code}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}&auth_type=${authType}` +
                `${bizAddin}`,
            preAuthCode: preAuthCode.pre_auth_code,
            ttl: preAuthCode.expires_in
        };
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async proposeClientAuthorizationDirect(componentAppId: string, componentAccessToken: string, redirectUri: string, bizAppId?: string, authType: string = '2') {
        const preAuthCode = await this.getPreAuthCode(componentAppId, componentAccessToken);

        const bizAddin = bizAppId ? `&biz_appid=${bizAppId}` : '';

        return {
            url: `https://mp.weixin.qq.com/safe/bindcomponent?` +
                `action=bindcomponent&no_scan=1&component_appid=${componentAppId}&pre_auth_code=${preAuthCode.pre_auth_code}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}&auth_type=${authType}` +
                `${bizAddin}`,
            preAuthCode: preAuthCode.pre_auth_code,
            ttl: preAuthCode.expires_in
        };
    }


    async wxaClientServerUriOperations(accessToken: string, action?: 'get'): Promise<inf.WxaServerUriReceipt>;
    async wxaClientServerUriOperations(
        accessToken: string,
        action: 'add' | 'delete' | 'set',
        requestDomain?: string | string[],
        wsRequestDomain?: string | string[],
        uploadDomain?: string | string[],
        downloadDomain?: string | string[]
    ): Promise<inf.WxaServerUriReceipt>;

    async wxaClientServerUriOperations(
        accessToken: string,
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

        const result = await this.postJson(
            '/wxa/modify_domain',
            { access_token: accessToken },
            {
                action,
                requestdomain: requestDomain,
                wsrequestdomain: wsRequestDomain,
                uploaddomain: uploadDomain,
                downloaddomain: downloadDomain
            }
        );

        return result as inf.WxaServerUriReceipt;
    }

    async wxaWebViewWhitelistOperations(
        accessToken: string,
        action?: 'get'
    ): Promise<inf.WxaWebViewWhitelistReceipt>;
    async wxaWebViewWhitelistOperations(
        accessToken: string,
        action: 'add' | 'delete' | 'set',
        webviewDomainWhitelist?: string | string[]
    ): Promise<inf.WxaWebViewWhitelistReceipt>;


    async wxaWebViewWhitelistOperations(
        accessToken: string,
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

        const result = await this.postJson(
            '/wxa/setwebviewdomain',
            { access_token: accessToken },
            queryBody
        );

        return result as inf.WxaWebViewWhitelistReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async wxaGetAccountInfo(accessToken: string) {
        const result = await this.get(
            '/cgi-bin/account/getaccountbasicinfo',
            { access_token: accessToken }
        );

        return result as inf.WxaAccountInfoReceipt;
    }

    async wxaNameModificationPersonal(accessToken: string, idCardMediaId: string, ...otherMediaIds: string[]) {
        const otherStuff = _(otherMediaIds).map((mediaId, indx) => {
            return [`naming_other_stuff_${indx + 1}`, mediaId];
        }).zipObjectDeep().value() || {};

        const result = await this.postJson(
            '/wxa/setnickname',
            { access_token: accessToken },
            {
                id_card: idCardMediaId,
                ...otherStuff
            },
        );

        return result as inf.WxaNamingReceipt;
    }

    async wxaNameModificationOrganizational(accessToken: string, licenseMediaId: string, ...otherMediaIds: string[]) {
        const otherStuff = _(otherMediaIds).map((mediaId, indx) => {
            return [`naming_other_stuff_${indx + 1}`, mediaId];
        }).zipObjectDeep().value() || {};

        const result = await this.postJson(
            '/wxa/setnickname',
            { access_token: accessToken },
            {
                license: licenseMediaId,
                ...otherStuff
            },
        );

        return result as inf.WxaNamingReceipt;
    }

    async wxaNamingStatus(accessToken: string, auditId: string) {
        const result = await this.postJson(
            '/wxa/api_wxa_querynickname',
            { access_token: accessToken },
            { auidit_id: auditId },
        );

        return result as inf.WxaNamingConditionQueryReceipt;
    }

    async wxaNamingPrecheck(accessToken: string, name: string) {
        const result = await this.postJson(
            '/cgi-bin/wxverify/checkwxverifynickname',
            {
                nick_name: name
            },
            {
                access_token: accessToken
            }
        );

        return result as inf.WxaNamingPrecheckReceipt;
    }

    async wxaModifyAvatar(accessToken: string, avatarMediaId: string, x1: number, y1: number, x2: number, y2: number) {
        const result = await this.postJson(
            '/cgi-bin/account/modifyheadimage',
            { access_token: accessToken },
            {
                head_img_media_id: avatarMediaId,
                x1, y1, x2, y2
            },
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaModifyDescription(accessToken: string, newDescription: string) {
        const result = await this.postJson(
            '/cgi-bin/account/modifysignature',
            {
                access_token: accessToken
            },
            {
                signature: newDescription
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    wxoProposeAdminRebind(componentAppId: string, clientId: string, redirectUri: string) {
        return `https://mp.weixin.qq.com/wxopen/componentrebindadmin?appid=${clientId}` +
            `&component_appid=${componentAppId}&redirect_uri=${encodeURI(redirectUri)}`;
    }

    async wxaCompleteAdminRebind(accessToken: string, taskId: string) {
        const result = await this.postJson(
            '/cgi-bin/account/componentrebindadmin',
            {
                access_token: accessToken
            },
            {
                taskid: taskId
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoGetAllPossibleCategories(accessToken: string) {
        const result = await this.get(
            '/cgi-bin/wxopen/getallcategories',
            { access_token: accessToken }
        );

        return result as inf.WxaGetAllCategoriesReceipt;
    }

    async wxoAddCategories(
        accessToken: string,
        categories: Array<{ first: number; second: number; certicates: Array<{ key: string; value: string }> }>
    ) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/addcategory',
            { categories },
            { access_token: accessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoRemoveCategory(
        accessToken: string,
        firstId: number,
        secondId: number
    ) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/deletecategory',
            { access_token: accessToken },
            { first: firstId, second: secondId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoModifyCategory(
        accessToken: string,
        category: { first: number; second: number; certicates: Array<{ key: string; value: string }> }
    ) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/modifycategory',
            { access_token: accessToken },
            { ...category }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoGetCurrentCategories(accessToken: string) {
        const result = await this.get(
            '/cgi-bin/wxopen/getcategory',
            { access_token: accessToken }
        );

        return result as inf.WxaGetCurrentCategoriesReceipt;
    }

    async wxaBindTester(accessToken: string, testerId: string) {
        const result = await this.postJson(
            '/wxa/bind_tester',
            {
                access_token: accessToken
            },
            {
                wechatid: testerId
            }
        );

        return result as inf.WxaBindTesterReceipt;
    }

    async wxaUnbindTester(accessToken: string, userStr: string) {
        const result = await this.postJson(
            '/wxa/unbind_tester',
            {
                access_token: accessToken
            },
            {
                userstr: userStr
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetAllTesters(accessToken: string) {
        const result = await this.postJson(
            '/wxa/memberauth',
            {
                access_token: accessToken
            },
            {
                action: "get_experiencer"
            }
        );

        return result as inf.WxaGetAllTestersReceipt;
    }

    async wxaCodeCommit(
        accessToken: string,
        templateId: number = 0,
        extJson: object = {},
        userVersion: string = '', userDesc: string = ''
    ) {
        const result = await this.postJson(
            '/wxa/commit',
            {
                template_id: templateId,
                ext_json: JSON.stringify(extJson),
                user_version: userVersion,
                user_desc: userDesc
            },
            {
                access_token: accessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaBetaQR(accessToken: string, path: string = '') {
        const result = await this.get(
            '/wxa/get_qrcode',
            {
                access_token: accessToken,
                path
            },
            { responseType: "buffer" }
        );

        return result as Buffer;
    }


    async wxaProductionWxaCode(accessToken: string, options: {
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
        const result = await this.postJson(
            'wxa/getwxacodeunlimit',
            {
                access_token: accessToken
            },
            {
                scene: options.scene,
                page: options.page,
                width: options.width,
                auto_color: options.autoColor,
                line_color: options.lineColor,
                is_hyaline: options.isHyaline
            }
        );

        return result as Buffer;
    }

    async wxaGetAvailableCategories(accessToken: string) {
        const result = await this.get(
            '/wxa/get_category',
            {
                access_token: accessToken
            }
        );

        return result as inf.WxaCodeCategoriesReceipt;
    }

    async wxaListPages(accessToken: string) {
        const result = await this.get(
            '/wxa/get_page',
            {
                access_token: accessToken
            }
        );

        return result as inf.WxaListPagesReceipt;
    }

    async wxaSubmitAudition(
        accessToken: string,
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
        const result = await this.postJson(
            '/wxa/submit_audit',
            {
                access_token: accessToken
            },
            {
                item_list: pages
            }
        );

        return result as inf.WxaSubmitReceipt;
    }

    async wxaGetCodeAuditionStatus(accessToken: string, auditId: string | number) {
        const result = await this.postJson(
            '/wxa/get_auditstatus',
            { access_token: accessToken },
            { auditid: parseInt(auditId as any, 10) }
        );

        return result as inf.WxaCheckAuditionStatusReceipt;
    }

    async wxaGetLatestCodeAuditionStatus(accessToken: string) {
        const result = await this.get(
            '/wxa/get_latest_auditstatus',
            { access_token: accessToken }
        );

        return result as inf.WxaCheckLatestAuditionStatusReceipt;
    }

    async wxaRelease(accessToken: string) {
        const result = await this.postJson(
            '/wxa/release',
            { access_token: accessToken },
            {}
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaSetProductionVersionVisibility(accessToken: string, visible: boolean) {
        const result = await this.postJson(
            '/wxa/change_visitstatus',
            { access_token: accessToken },
            {
                action: visible ? 'open' : 'close'
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaCodeRevert(accessToken: string) {
        const result = await this.get(
            '/wxa/revertcoderelease',
            {
                access_token: accessToken
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetAPISupportage(accessToken: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/getweappsupportversion',
            {
                access_token: accessToken
            },
            {}
        );

        return result as inf.WxaAPISupportageReceipt;
    }

    async wxaSetMinimalAPIVersion(accessToken: string, version: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/setweappsupportversion',
            {
                access_token: accessToken
            },
            {
                version
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoQRCodeReferenceRuleOperations(
        accessToken: string,
        rule: {
            prefix: string;
            permit_sub_rule: '1' | '2';
            path: string;
            open_version: '1' | '2' | '3';
            debug_url: string[];
            is_edit: 0 | 1;
        }
    ) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/qrcodejumpadd',
            {
                access_token: accessToken
            },
            {
                ...rule
            }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoGetAllQRReferenceRules(accessToken: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/qrcodejumpget',
            { access_token: accessToken },
            {}
        );

        return result as inf.WxaQRReferenceReceipt;
    }

    async wxoGetVerificationFile(accessToken: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/qrcodejumpdownload',
            { access_token: accessToken },
            {}
        );

        return result as inf.WxaVerificationFileReceipt;
    }

    async wxoPublishQRReference(accessToken: string, prefix: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/qrcodejumppublish',
            { access_token: accessToken },
            { prefix }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaUndoCodeSubmit(accessToken: string) {
        const result = await this.get(
            '/wxa/undocodeaudit',
            { access_token: accessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGrayscaleRelease(accessToken: string, percentage: number) {
        const result = await this.postJson(
            '/wxa/grayrelease',
            { access_token: accessToken },
            { gray_percentage: percentage }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaRevertGrayscaleRelease(accessToken: string) {
        const result = await this.get(
            '/wxa/revertgrayrelease',
            { access_token: accessToken }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetGrayscaleReleaseStatus(accessToken: string) {
        const result = await this.get(
            '/wxa/getgrayreleaseplan',
            { access_token: accessToken }
        );

        return result as inf.WxaGrayScaleStatusReceipt;
    }

    async wxaGetAllCodeDrafts(accessToken: string) {
        const result = await this.get(
            '/wxa/gettemplatedraftlist',
            { access_token: accessToken }
        );

        return result as inf.WxaGetAllCodeDraftsReceipt;
    }

    async wxaGetAllCodeTemplates(accessToken?: string) {
        const result = await this.get(
            '/wxa/gettemplatelist',
            { access_token: accessToken }
        );

        return result as inf.WxaGetAllCodeTemplatesReceipt;
    }

    async wxaComposeCodeTemplate(accessToken: string, draftId: number) {
        const result = await this.postJson(
            '/wxa/addtotemplate',
            { access_token: accessToken },
            { draft_id: draftId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaRemoveFromCodeTemplate(accessToken: string, templateId: number) {
        const result = await this.postJson(
            '/wxa/deletetemplate',
            { access_token: accessToken },
            { template_id: templateId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async wxaExchangeForSessionKey(
        componentAppId: string, componentAccessToken: string, appId: string, code: string) {

        const result = await this.get(
            '/sns/component/jscode2session',
            {
                appid: appId,
                js_code: code,
                grant_type: 'authorization_code',
                component_appid: componentAppId,
                component_access_token: componentAccessToken
            }
        );

        return result as inf.WxaLoginReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async wxaLogin(code: string, appId: string, appSecret: string) {

        const result = await this.get(
            '/sns/jscode2session',
            {
                appid: appId,
                secret: appSecret,
                js_code: code,
                grant_type: 'authorization_code'
            }
        );

        return result as inf.WxaLoginReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async wxaComponentLogin(code: string, appId: string, appSecret: string) {

        const result = await this.get(
            '/sns/component/jscode2session',
            {
                appid: appId,
                secret: appSecret,
                js_code: code,
                grant_type: 'authorization_code'
            }
        );

        return result as inf.WxaLoginReceipt;
    }

    async wxoListAllPublicMessageTemplates(accessToken: string, offset = 0, count = 5) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/template/library/list',
            { access_token: accessToken },
            { offset, count }
        );

        return result as inf.WxaGetAllMessageComponentsReceipt;
    }

    async wxoGetSinglePublicMessageTemplate(accessToken: string, componentId: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/template/library/get',
            { access_token: accessToken },
            { id: componentId }
        );

        return result as inf.WxaGetMessageComponentReceipt;
    }

    async wxoComposeCustomMessageTemplate(accessToken: string, componentId: string, ...keywordIds: number[]) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/template/add',
            { access_token: accessToken },
            {
                id: componentId,
                keyword_id_list: keywordIds
            }
        );

        return result as inf.WxaComposeMessageTemplateReceipt;
    }

    async wxoGetAllCustomMessageTemplates(accessToken: string, offset = 0, count = 20) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/template/list',
            { access_token: accessToken },
            { offset, count }
        );

        return result as inf.WxaGetAllMessageTemplatesReceipt;
    }

    async wxoRemoveSingleCustomMessageTemplate(accessToken: string, templateId: string) {
        const result = await this.postJson(
            '/cgi-bin/wxopen/template/del',
            { access_token: accessToken },
            { template_id: templateId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoSendTemplateMessage(
        accessToken: string,
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
        const result = await this.postJson(
            '/cgi-bin/message/wxopen/template/send',
            { access_token: accessToken },
            qObj
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoCreateAccountAndBindMiniProgram(accessToken: string, appId: string) {
        const result = await this.postJson(
            '/cgi-bin/open/create',
            { access_token: accessToken },
            { appid: appId }
        );

        return result as inf.WxoAccountOpsWithAppIdReceipt;
    }

    async wxoBindMiniProgram(accessToken: string, appId: string, wxoId: string) {
        const result = await this.postJson(
            '/cgi-bin/open/bind',
            { access_token: accessToken },
            { appid: appId, open_appid: wxoId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxoUnbindMiniProgram(accessToken: string, appId: string, wxoId: string) {
        const result = await this.postJson(
            '/cgi-bin/open/unbind',
            { access_token: accessToken },
            { appid: appId, open_appid: wxoId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaGetBoundOpenPlatformAccount(accessToken: string, appId: string) {
        const result = await this.postJson(
            '/cgi-bin/open/get',
            { access_token: accessToken },
            { appid: appId }
        );

        return result as inf.WxoAccountOpsWithAppIdReceipt;
    }

    async wxaForbidBeingSearched(accessToken: string, disallowPresenceInSearch = false) {
        const result = await this.postJson(
            '/wxa/changewxasearchstatus',
            { access_token: accessToken },
            { status: disallowPresenceInSearch ? 1 : 0 }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaCheckSearchPreference(accessToken: string) {
        const result = await this.get(
            '/wxa/getwxasearchstatus',
            { access_token: accessToken }
        );

        return result as inf.WxaGetCurrentSearchPreferenceReceipt;
    }


    async wxaApplyForPlugin(accessToken: string, pluginId: string) {
        const result = await this.postJson(
            '/wxa/plugin',
            { access_token: accessToken },
            { action: 'apply', plugin_appid: pluginId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaListInstalledPlugin(accessToken: string) {
        const result = await this.postJson(
            '/wxa/plugin',
            { access_token: accessToken },
            { action: 'list' }
        );

        return result as inf.WxaGetPluginsReceipt;
    }

    async wxaUninstallPlugin(accessToken: string, pluginId: string) {
        const result = await this.postJson(
            '/wxa/plugin',
            { access_token: accessToken },
            { action: 'unbind', plugin_appid: pluginId }
        );

        return result as inf.WeChatErrorReceipt;
    }

    async wxaAnalysisDailySummaryTrend(accessToken: string, beginDate: string, endDate: string) {
        const result = await this.postJson(
            '/datacube/getweanalysisappiddailysummarytrend',
            { access_token: accessToken },
            { begin_date: beginDate, end_date: endDate }
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
        const result = await this.postJson(
            `/datacube/getweanalysisappid${scale}visittrend`,
            { access_token: clientAccessToken },
            { begin_date: beginDate, end_date: endDate }
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
        const result = await this.postJson(
            `/datacube/getweanalysisappidvisitdistribution`,
            { access_token: clientAccessToken },
            { begin_date: beginDate, end_date: endDate }
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
        const result = await this.postJson(
            `/datacube/getweanalysisappiddaily${scale}retaininfo`,
            { access_token: clientAccessToken },
            { begin_date: beginDate, end_date: endDate }
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
        const result = await this.postJson(
            `/datacube/getweanalysisappidvisitpage`,
            { access_token: clientAccessToken },
            { begin_date: beginDate, end_date: endDate }
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

        const result = await this.postJson(
            `/cgi-bin/message/custom/send`,
            { access_token: clientAccessToken },
            qObj
        );

        return result as inf.WeChatErrorReceipt;
    }

    async uploadTemporaryMedia(
        clientAccessToken: string,
        type: 'image' | 'voice' | 'video' | 'thumb',
        dataStream: Readable,
        fileName?: string, mimeType?: string) {
        const result = await this.postMultipart(
            '/cgi-bin/media/upload',
            {
                access_token: clientAccessToken,
                type
            },
            [
                ['media', dataStream, { filename: fileName, contentType: mimeType }]
            ]
        );


        return result as inf.WeChatMediaUploadReceipt;
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async wxaMediaCheckAsync(
        clientAccessToken: string, mediaUrl: string, type: 'image' | 'audio' = 'image'
    ) {
        const result = await this.postJson(
            `/wxa/media_check_async`,
            { access_token: clientAccessToken },
            { media_url: mediaUrl, media_type: type === 'audio' ? 2 : 1 }
        );

        return result as {
            trace_id: string;
            errcode: number;
            errmsg: string;
        };
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async wxaMsgSecCheck(
        clientAccessToken: string, content: string
    ) {
        const result = await this.postJson(
            `/wxa/msg_sec_check`,
            { access_token: clientAccessToken },
            { content }
        );

        return result as {
            errcode: number;
            errmsg: 'ok' | 'risky';
        };
    }

}