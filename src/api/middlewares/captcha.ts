
// tslint:disable: no-magic-numbers

import { Context } from 'koa';

import svgCaptcha from 'svg-captcha';

import { ContextSession } from './session';

import { ApplicationError } from '../../lib/errors';


export const CAPTCHA_CONTENT_KEY = 'captcha';
export const CAPTCHA_ISSUED_AT = 'captcha-issued-at';
export const CAPTCHA_VERIFIED_AT = 'captcha-verified-at';
export const CAPTCHA_FAILED_TRIES = 'captcha-failed-tries';

const CAPTCHA_MAX_TRIES = 3;
const CAPTCHA_LIFESPAN = 5 * 60 * 1000;
const CAPTCHA_INTERVAL = 1 * 1000;

const CAPTCHA_VARIFIED_FOR = 10 * 60 * 1000;

export interface ContextSVGCaptcha {
    captcha: {
        issue: () => Promise<string>;
        verify: (text: string) => Promise<boolean>;
        isVerified: (timeAgo?: number) => Promise<boolean>;
        assertVerified: (timeAgo?: number) => Promise<true>;
        validFor: number;
    }
}

export async function svgCaptchaFacilityMiddleware(_ctx: Context, next: () => Promise<any>) {
    const ctx = _ctx as typeof _ctx & ContextSession & ContextSVGCaptcha;
    const captchaFacl: any = {};
    captchaFacl.issue = async () => {
        const sid = ctx.sessionId;
        const sessionData = await ctx.sessionPromise;

        if (!(sid && sessionData)) {
            throw new ApplicationError(50001, 'session');
        }

        const captchaIssuedAt: number = sessionData[CAPTCHA_ISSUED_AT] || 0;
        const lockedTimeLeft = captchaIssuedAt + CAPTCHA_INTERVAL - Date.now();
        const locked = lockedTimeLeft > 0;

        if (locked) {
            throw new ApplicationError(42901, { captcha: lockedTimeLeft });
        }

        const captcha = svgCaptcha.create({ noise: 4 });

        await ctx.sessionService.setToSession(sid, {
            [CAPTCHA_FAILED_TRIES]: 0,
            [CAPTCHA_CONTENT_KEY]: captcha.text,
            [CAPTCHA_ISSUED_AT]: Date.now()
        });

        return captcha.data;
    };

    captchaFacl.verify = async (text: string) => {
        const sid = ctx.sessionId;
        const sessionData = await ctx.sessionPromise;

        const validText: string | undefined = sessionData[CAPTCHA_CONTENT_KEY];
        const nowTs = Date.now();

        if (!(sid && sessionData)) {
            throw new ApplicationError(50001, 'session');
        }
        if (!text) {
            throw new ApplicationError(40001, 'captcha');
        }
        if (!validText) {
            throw new ApplicationError(41201, 'captcha');
        }

        const captchaIssuedAt: number = sessionData[CAPTCHA_ISSUED_AT] || 0;

        if ((captchaIssuedAt + CAPTCHA_LIFESPAN) < nowTs) {
            throw new ApplicationError(41202, 'captcha');
        }

        const failedTries = sessionData[CAPTCHA_FAILED_TRIES] || 0;
        if (failedTries > CAPTCHA_MAX_TRIES) {
            throw new ApplicationError(40301, { max: CAPTCHA_MAX_TRIES, you: failedTries });
        }

        if (text.toLowerCase() !== validText.toLowerCase()) {
            await ctx.sessionService.sessionKeyincrBy(sid, CAPTCHA_FAILED_TRIES, 1);
            throw new ApplicationError(40002, { captcha: text, triesLeft: CAPTCHA_MAX_TRIES - failedTries - 1 });
        }

        await ctx.sessionService.setToSession(sid, {
            [CAPTCHA_VERIFIED_AT]: nowTs
        });

        return true;
    };

    captchaFacl.isVerified = async (timeAgo: number = CAPTCHA_VARIFIED_FOR) => {
        const sessionData = await ctx.sessionPromise;
        const nowTs = Date.now();

        if (!sessionData) {
            throw new ApplicationError(50001, 'session');
        }
        const captchaVerifiedAt: number = sessionData[CAPTCHA_VERIFIED_AT] || 0;

        if (captchaVerifiedAt + timeAgo < nowTs) {
            return false;
        }

        return true;
    };

    captchaFacl.assertVerified = async (timeAgo?: number) => {
        const result = await captchaFacl.isVerified(timeAgo);
        if (!result) {
            throw new ApplicationError(41203, 'captcha');
        }

        return result;
    };

    captchaFacl.validFor = CAPTCHA_VARIFIED_FOR;

    ctx.captcha = captchaFacl;

    return next();
}
