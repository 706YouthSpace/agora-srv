
// tslint:disable: no-magic-numbers
import { Context } from 'koa';
import { ContextSession } from './session';
import { ApplicationError } from '../../lib/errors';

export interface SessionWxaFacility {
    wxaFacl: {
        assertLoggedIn: () => Promise<{ cuid: string; wxAppId: string; wxOpenId: string; wxSessionKey: string }>;
        isLoggedIn: () => Promise<false | { cuid: string; wxAppId: string; wxOpenId: string; wxSessionKey: string }>;
        login: (wxAppId: string, wxOpenId: string, cuid: string, wxSessionKey: string) => Promise<any>;
        logOut: () => Promise<any>;
    }
}

export const SESSION_CURRENT_WX_APP_ID = 'wxAppId';
export const SESSION_CURRENT_WX_OPEN_ID = 'wxOpenId';
export const SESSION_CURRENT_WX_USER_ID = 'cuid';
export const SESSION_CURRENT_WX_SESSION_KEY = 'wxSessionKey';

export const WX_USER_SESSION_TTL_SECONDS = 2 * 60 * 60;

export async function injectSessionWxaFacilityMiddleware(_ctx: Context, next: () => Promise<any>) {
    const ctx = _ctx as typeof _ctx & ContextSession & SessionWxaFacility;

    if (!(ctx.sessionId && ctx.sessionPromise)) {
        throw new ApplicationError(50001, 'session');
    }

    const wxaFacl: any = {};

    wxaFacl.login = (wxAppId: string, wxOpenId: string, cuid: string, wxSessionKey: string) => {
        return ctx.sessionService.setToSession(
            ctx.sessionId,
            {
                [SESSION_CURRENT_WX_APP_ID]: wxAppId,
                [SESSION_CURRENT_WX_OPEN_ID]: wxOpenId,
                [SESSION_CURRENT_WX_USER_ID]: cuid,
                [SESSION_CURRENT_WX_SESSION_KEY]: wxSessionKey
            },
            WX_USER_SESSION_TTL_SECONDS
        );
    };

    wxaFacl.logOut = async () => {
        await ctx.sessionPromise;
        ctx.sessionData[SESSION_CURRENT_WX_APP_ID] = null;
        ctx.sessionData[SESSION_CURRENT_WX_OPEN_ID] = null;
        ctx.sessionData[SESSION_CURRENT_WX_USER_ID] = null;
        ctx.sessionData[SESSION_CURRENT_WX_SESSION_KEY] = null;


        return ctx.sessionService.setToSession(ctx.sessionId, {
            [SESSION_CURRENT_WX_APP_ID]: undefined,
            [SESSION_CURRENT_WX_OPEN_ID]: undefined,
            [SESSION_CURRENT_WX_USER_ID]: undefined,
            [SESSION_CURRENT_WX_SESSION_KEY]: undefined
        });
    };

    wxaFacl.isLoggedIn = async () => {
        const sessionData = await ctx.sessionPromise;

        if (!sessionData[SESSION_CURRENT_WX_USER_ID]) {
            return false;
        }

        return {
            cuid: sessionData[SESSION_CURRENT_WX_USER_ID],
            wxAppId: sessionData[SESSION_CURRENT_WX_APP_ID],
            wxOpenId: sessionData[SESSION_CURRENT_WX_OPEN_ID],
            wxSessionKey: sessionData[SESSION_CURRENT_WX_SESSION_KEY]
        };
    };

    wxaFacl.assertLoggedIn = async () => {
        const result = await wxaFacl.isLoggedIn();
        if (!result) {
            throw new ApplicationError(40102);
        }

        return result;
    };

    ctx.wxaFacl = wxaFacl;

    return next();
}
