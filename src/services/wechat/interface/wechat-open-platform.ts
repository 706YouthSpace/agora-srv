import { WeChatErrorReceipt } from './wechat-mini-program';

// tslint:disable:no-magic-numbers
export interface WxoErrorReceipt {
    errcode: number;
    errmsg: string;
}


export interface WxoComponentAccessTokenReceipt {
    component_access_token: string;
    expires_in: number;
}

export interface WxoAccessTokenReceipt {
    access_token: string;
    expires_in: number;
}

export interface WxoPreAuthCodeReceipt {
    pre_auth_code: string;
    expires_in: number;
}

export interface WxoClientAuthorizationReceipt {
    authorization_info: {
        authorizer_appid: string;
        authorizer_access_token: string;
        expires_in: number;
        authorizer_refresh_token: string;
        func_info: Array<{ funcscope_category: { id: WECHAT_API_ACCESS_REALM } }>;
    }
}

export interface WxoClientAuthorizationTokenRefreshReceipt {
    authorizer_access_token: string;
    expires_in: number;
    authorizer_refresh_token: string;
}

export enum WECHAT_ACCOUNT_TYPE {
    SUBSCRIPTION_ACCOUNT = 0,
    LEGACY_SUBSCRIPTION_ACCOUNT,
    SERVICE_ACCOUNT
}

export enum WECHAT_VERIFICATION_STATUS {
    NOT_VERIFIED = -1,
    WECHAT_VERIFIED,
    SINA_WEIBO_VERIFIED,
    TENCENT_WEIBO_VERIFIED,
    WECHAT_QUALIFIED_BUT_NAME_NOT_VERIFIED,
    SINA_WEIBO_VERIFIED_AND_WECHAT_QUALIFIED_BUT_NAME_NOT_VERIFIED,
    TENCENT_WEIBO_VERIFIED_AND_WECHAT_QUALIFIED_BUT_NAME_NOT_VERIFIED
}

export enum WECHAT_SWITCH {
    NEGATIVE = 0,
    AFFIRMATIVE
}

export enum WECHAT_API_ACCESS_REALM {
    MESSAGING = 1,                                      // 1、消息管理权限
    USER_MANAGEMENT,                                    // 2、用户管理权限
    ACCOUNT_SERVICE,                                    // 3、帐号服务权限
    WEB_SERVICE,                                        // 4、网页服务权限
    MINI_STORE,                                         // 5、微信小店权限
    CUSTOMER_SUPPORT,                                   // 6、微信多客服权限
    BROADCAST_AND_NOTIFICATION,                         // 7、群发与通知权限
    CARDS_AND_TICKETS,                                  // 8、微信卡券权限
    QR_SCAN,                                            // 9、微信扫一扫权限
    WIFI,                                               // 10、微信连WIFI权限
    CONTENT_MANAGEMENT,                                 // 11、素材管理权限
    SHAKE_GEO_NEAR,                                     // 12、微信摇周边权限
    OFFLINE_STORE,                                      // 13、微信门店权限
    WEPAY,                                              // 14、微信支付权限
    CUSTOM_MENU,                                        // 15、自定义菜单权限
    WECHAT_VERIFICATION,                                // 16、获取认证状态及信息
    MINI_PROGRAM_ACCOUNT_MANAGEMENT,                    // 17、小程序帐号管理权限
    MINI_PROGRAM_DEVELOPMENT_AND_DATA_ANALYSIS,         // 18、小程序开发管理与数据分析权限
    MINI_PROGRAM_SERVICE_MESSAGING_MANAGEMENT,          // 19、客服消息管理权限（小程序）
    MINI_PROGRAM_LOGIN,                                 // 20、微信登录权限（小程序）
    MINI_PROGRAM_DATA_ANALYSIS,                         // 21、数据分析权限（小程序）
    CITY_SERVICE,                                       // 22、城市服务接口权限
    ADVERTISING,                                        // 23、广告管理权限
    OPEN_PLATFORM_ACCOUNT_MANAGEMENT,                   // 24、开放平台帐号管理权限
    MINI_PROGRAM_OPEN_PLATFORM_ACCOUNT_MANAGEMENT,      // 25、开放平台帐号管理权限（小程序）
    FAPIAO,                                             // 26、微信电子发票权限

    MINI_PROGRAM_SET_BASIC_PROFILE = 30,                // 30、小程序基本信息设置权限

    MINI_PROGRAM_NEAR_BY_LOCATIONS = 37,                // 37、小程序附近地点功能权限

    MINI_PROGRAM_PLUGIN_MANAGEMENT = 40,                // 40、小程序插件管理权限
    MINI_PROGRAM_EXPRESS_WIDGET_MANAGEMENT,             // 41、小程序搜索widget管理权限
}

export interface WxoClientInfoReceipt {
    authorizer_info: {
        nick_name: string;
        head_img: string;
        service_type_info: {
            id: WECHAT_ACCOUNT_TYPE;
        };
        verify_type_info: {
            id: WECHAT_VERIFICATION_STATUS;
        };
        user_name: string;
        principal_name: string;
        business_info: {
            open_store: WECHAT_SWITCH;
            open_scan: WECHAT_SWITCH;
            open_pay: WECHAT_SWITCH;
            open_card: WECHAT_SWITCH;
            open_shake: WECHAT_SWITCH;
        };
        alias?: string;
        signature?: string;
        qrcode_url: string;
        MiniProgramInfo?: {
            network: {
                RequestDomain: string[];
                WsRequestDomain: string[];
                UploadDomain: string[];
                DownloadDomain: string[];
            };
            categories: Array<{ first: string; second: string }>;
            visit_status: number; // WECHAT: Lack of documentation.
        };
    };

    authorization_info: {
        authorization_appid: string;
        func_info: Array<{ funcscope_category: { id: WECHAT_API_ACCESS_REALM } }>;
    };
}

export interface WxoClientOptionReceipt {
    authorizer_appid: string;
    option_name: string;
    option_value: string;
}

export enum WeChatLocationReportSwitch {
    DISABLED = 0,
    ON_SESSION_START,
    EVERY_FIVE_SECONDS
}

export interface WxoAccountOpsWithAppIdReceipt extends WeChatErrorReceipt {
    open_appid: string;
}

export enum WECHAT_PUBLIC_ACCOUNT_MINI_PROGRAM_LINKING_STATUS {
    LINKED = 1,
    PENDING_CONFIRMATION_MINI_PROGRAM_OWNER,
    DENIED_BY_MINI_PROGRAM_OWNER,
    PENDING_CONFIRMATION_PUBLIC_ACCOUNT_OWNER
}
export interface WxoGetAllLinkedMiniProgramReceipt extends WeChatErrorReceipt {
    wxopens: {
        items: Array<{
            status: WECHAT_PUBLIC_ACCOUNT_MINI_PROGRAM_LINKING_STATUS;
            username: string;
            nickname: string;
            selected: WECHAT_SWITCH;
            nearby_display_status: WECHAT_SWITCH;
            released: WECHAT_SWITCH;
            headimg_url: string;
            func_infos: Array<{
                status: WECHAT_SWITCH;
                id: number;
                name: string;
            }>;
            copy_verify_status: WECHAT_SWITCH;
            email: string;
        }>;
    }
}
