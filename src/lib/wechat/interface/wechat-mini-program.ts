import { WxoErrorReceipt, WECHAT_SWITCH } from './wechat-open-platform';
export interface WxaLoginParams {
    appid: string;
    secret: string;
    js_code: string;
    grant_type: 'authorization_code';
}

export interface WxaLoginReceipt {
    openid: string;
    session_key: string;
    unionid?: string;
}

export interface WeChatErrorReceipt {
    errcode: number;
    errmsg: string;
}


export interface WxaDecryptedUserInfo {
    openId: string;
    nickName: string;
    avatarUrl: string;
    gender: '1' | '2' | '0';
    city: string;
    province: string;
    country: string;
    unionId: string;
    watermark: {
        appid: string;
        timestamp: string | Date;
    }
}

export interface WxaServerUriReceipt extends WxoErrorReceipt {
    requestdomain: string[];
    wsrequestdomain: string[];
    uploaddomain: string[];
    downloaddomain: string[];
}

export interface WxaWebViewWhitelistReceipt extends WxoErrorReceipt { }

export enum WECHAT_MINI_PROGRAM_ACCOUNT_TYPE {
    WECHAT_SUBSCRIPTION_ACCOUNT = 1,
    WECHAT_SERVICE_ACCOUNT,
    BARE_MINIPROGRAM
}

export enum WECHAT_MINI_PROGRAM_PRINCIPAL_TYPE {
    ENTERPRISE = 1,
    // WeChat not documented. WTF.
}

export enum WECHAT_MINI_PROGRAM_VERIFICATION_STATUS {
    VERIFIED = 1,
    PENDING,
    FAILURE
}
export interface WxaAccountInfoReceipt extends WxoErrorReceipt {
    appid: string;
    account_type: WECHAT_MINI_PROGRAM_ACCOUNT_TYPE;
    principal_type: WECHAT_MINI_PROGRAM_PRINCIPAL_TYPE;
    principal_name: string;
    realname_status: WECHAT_MINI_PROGRAM_VERIFICATION_STATUS;
    wx_verify_info: {
        qualification_verify: WECHAT_SWITCH;
        naming_verify: WECHAT_SWITCH;
        annual_review: WECHAT_SWITCH;
        annual_review_begin_time: number;
        annual_review_end_time: number;
    };
    signature_info: {
        signature: string;
        modify_used_count: number;
        nodify_quota: number;
    };
    head_image_info: {
        head_image_url: string;
        modify_used_count: number;
        modify_quota: number;
    };
}

export interface WxaNamingReceipt extends WxoErrorReceipt {
    wording: string;
    audit_id: number;
}

export enum WECHAT_MINI_PROGRAM_AUDITION_STATUS {
    PENDING = 1,
    FAILED,
    SUCCEEDED
}
export interface WxaNamingConditionQueryReceipt extends WeChatErrorReceipt {
    nickname: string;
    audit_stat: WECHAT_MINI_PROGRAM_AUDITION_STATUS;
    fail_reason: string;
    create_time: number;
    audit_time: number;
}

export interface WxaNamingPrecheckReceipt extends WeChatErrorReceipt {
    hit_condition: boolean;
    woring: string;
}

export interface WxaGetAllCategoriesReceipt extends WeChatErrorReceipt {
    category_list: {
        categories: Array<{
            children: number[];
            father: number;
            id: number;
            level: number;
            name: string;
            qualify: {
                exter_list: Array<{ inner_list: Array<{ name: string; url: string }> }>;
            };
            sensitive_type: WECHAT_SWITCH;
        }>;
    }
}

export interface WxaGetCurrentCategoriesReceipt extends WeChatErrorReceipt {
    categories: Array<{
        first: number;
        first_name: string;
        second: number;
        second_name: string;
        audit_status: WECHAT_MINI_PROGRAM_AUDITION_STATUS;
        audit_resaon: string;
    }>;
    limit: number;
    quota: number;
    category_limit: number;
}

export interface WxaBindTesterReceipt extends WeChatErrorReceipt {
    userstr: string;
}

export interface WxaGetAllTestersReceipt extends WeChatErrorReceipt {
    members: Array<{ userstr: string }>;
}

export interface WxaGetAllCodeDraftsReceipt extends WeChatErrorReceipt {
    draft_list: Array<{
        create_time: number;
        user_version: string;
        user_desc: string;
        draft_id: number;
    }>;
}

export interface WxaGetAllCodeTemplatesReceipt extends WeChatErrorReceipt {
    template_list: Array<{
        create_time: number;
        user_version: string;
        user_desc: string;
        template_id: number;
    }>;
}

export interface WxaGetAllMessageComponentsReceipt extends WeChatErrorReceipt {
    list: Array<{ id: string; title: string }>;
    total_count: number;
}

export interface WxaGetMessageComponentReceipt extends WeChatErrorReceipt {
    id: string;
    title: string;
    keyword_list: Array<{
        keyword_id: number;
        name: string;
        example: string;
    }>
}

export interface WxaComposeMessageTemplateReceipt extends WeChatErrorReceipt {
    template_id: string;
}

export interface WxaGetAllMessageTemplatesReceipt extends WeChatErrorReceipt {
    list: Array<{
        template_id: string;
        title: string;
        content: string;
        example: string;
    }>;
}

export interface WxaGetCurrentSearchPreferenceReceipt extends WeChatErrorReceipt {
    status: WECHAT_SWITCH;
}

export enum WECHAT_MINI_PROGRAM_PLUGIN_APPLICATION_STATUS {
    PENDING = 1,
    PASSED,
    DENIED,
    TIMEDOUT
}
export interface WxaGetPluginsReceipt extends WeChatErrorReceipt {
    plugin_list: Array<{
        appid: string;
        status: WECHAT_MINI_PROGRAM_PLUGIN_APPLICATION_STATUS;
        nickname: string;
        headimgrl: string;
    }>
}

export interface WxaCodeCategoriesReceipt extends WeChatErrorReceipt {
    category_list: Array<{
        first_class: string;
        second_class: string;
        first_id: number;
        second_id: number;

        third_class?: string;
        third_id?: number;
    }>;
}

export interface WxaListPagesReceipt extends WeChatErrorReceipt {
    page_list: string[];
}

export interface WxaSubmitReceipt extends WeChatErrorReceipt {
    auditid: number;
}

export enum WECHAT_MINI_PROGRAM_CODE_AUDITION_STATUS {
    PASSED = 0,
    FAILED,
    PENDING
}
export interface WxaCheckAuditionStatusReceipt extends WeChatErrorReceipt {
    status: WECHAT_MINI_PROGRAM_CODE_AUDITION_STATUS;
    reason?: string;
}

export interface WxaCheckLatestAuditionStatusReceipt extends WeChatErrorReceipt {
    auditid: string;
    status: WECHAT_MINI_PROGRAM_CODE_AUDITION_STATUS;
    reason?: string;
}

export interface WxaAPISupportageReceipt extends WeChatErrorReceipt {
    now_version: string;
    uv_info: {
        items: Array<{ percentage: number; version: string }>;
    }
}

export enum WECHAT_SWITCH_2 {
    NEGATIVE = 1,
    POSITIVE
}

export enum WECHAT_MINI_PROGRAM_VERSIONS {
    ALPHA = 1,
    BETA,
    GA
}

export interface WxaQRReferenceReceipt extends WeChatErrorReceipt {
    rule_list: Array<{
        state: WECHAT_SWITCH_2;
        prefix: string;
        path: string;
        open_version: WECHAT_MINI_PROGRAM_VERSIONS;
        permit_sub_rule: WECHAT_SWITCH_2;
        debug_url?: string[];
    }>;
    qrcodejump_open: WECHAT_SWITCH;
    qrcodejump_pub_quota: number;
    list_size: number;
}

export interface WxaVerificationFileReceipt extends WeChatErrorReceipt {
    file_name: string;
    file_content: string;
}

export enum WECHAT_GRAYSCALE_RELEASE_STATUS {
    INIT = 0,
    PENDING,
    PAUSED,
    COMPLETED,
    CANCELED
}
export interface WxaGrayScaleStatusReceipt extends WeChatErrorReceipt {
    gray_release_plan: {
        status: WECHAT_GRAYSCALE_RELEASE_STATUS;
        create_timestamp: number;
        gray_percentage: number;
    }
}
