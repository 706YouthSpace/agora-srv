import { Dictionary } from 'lodash';

// tslint:disable: no-magic-numbers
export interface WeChatSNSUserInfo extends Dictionary<any> {
    openid: string;
    nickname: string;
    sex: 1|2;
    province: string;
    city: string;
    country: string;
    headimgurl: string;
    privilege: string[];
    unionid?: string;
}

export interface WeChatSNSAccessTokenReceipt extends Dictionary<any> {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    openid: string;
    scope: string;
    unionid?: string;
}

export interface WeChatSNSErrorReceipt {
    errcode: number;
    errmsg: string;
}

export interface WeChatSNSAccessTokenRequestParams {
    appid: string;
    secret: string;
    code: string;
    grant_type: 'authorization_code';
}

export interface WeChatSNSAccessTokenRefreshParams {
    appid: string;
    secret: string;
    code: string;
    grant_type: 'authorization_code';
}
