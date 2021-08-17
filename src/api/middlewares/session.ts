// import { Context } from 'koa';
// import { v4 as uuidv4 } from 'uuid';

// import { logger } from '../../services/logger';
// import { sessionTokenHasher, sessionService } from '../../services/session';
// import { encodeBase64UrlSafe } from '../../lib/binary';

// export const SESSION_TOKEN_HEADER_NAME = 'X-Session-Token';
// export const SET_SESSION_TOKEN_HEADER_NAME = 'X-Set-Session-Token';
// export const SESSION_TOKEN_QUERY_PARAM = '_sessionToken';

// export const SESSION_ID_COOKIE_NAME = 'sid';
// export const SESSION_SIGNATURE_COOKIE_NAME = 'sid.sig';

// const MILLISECOUNDS_IN_ONE_SECOUND = 1000;
// const SESSION_EXPIRES_AFTER_MILLISECOUNDS = sessionService.defaultTTL * MILLISECOUNDS_IN_ONE_SECOUND;

// export interface ContextSession {
//     sessionId: string;
//     sessionSignature: string;
//     sessionToken: string;
//     sessionData: { [k: string]: any };
//     sessionPromise: Promise<any>;
//     sessionService: typeof sessionService;
//     simpleSign: (data: string) => string;
// }

// function simpleIsIpv4(str: string) {
//     if (/^\b(?:\d{1,3}\.){3}\d{1,3}\b$/.test(str)) {
//         return true;
//     }

//     return false;
// }

// /**
//  * Auto Session Middleware
//  *
//  * Automaticly get/set session id/signature/data.
//  * Injects session and sessionService into context.
//  *
//  * Two possible session formats: Header / URL Param / Cookie.
//  *
//  * Header format:  `[sid: UUIDv4 Hex String]:[signature: saltedHash(sid) Base64URLSafe String]`
//  *
//  */
// export async function autoSessionMiddleware(ctx: Context, next: () => Promise<any>) {
//     const sessionToken = ctx.headers[SESSION_TOKEN_HEADER_NAME.toLowerCase()];
//     const queryToken = ctx.query[SESSION_TOKEN_QUERY_PARAM];
//     let sid: string | undefined;
//     let sig: string | undefined;
//     let verifiedSid: string;
//     let verifiedSessionSignature: string;

//     if (sessionToken) {
//         // Use header token
//         [sid, sig] = sessionToken.split(':');
//     } else if (queryToken) {
//         // Use query param
//         [sid, sig] = queryToken.split(':');
//     } else {
//         // Or use cookie
//         sid = ctx.cookies.get(SESSION_ID_COOKIE_NAME.toLowerCase());
//         sig = ctx.cookies.get(SESSION_SIGNATURE_COOKIE_NAME.toLowerCase());
//     }

//     if (sid && encodeBase64UrlSafe(sessionTokenHasher.hash(sid) as Buffer) === sig) {
//         verifiedSid = sid;
//         verifiedSessionSignature = sig;
//     } else {
//         // Creating new session here.
//         verifiedSid = uuidv4();
//         verifiedSessionSignature = encodeBase64UrlSafe(sessionTokenHasher.hash(verifiedSid) as Buffer);

//         ctx.response.set(SET_SESSION_TOKEN_HEADER_NAME, `${verifiedSid}:${verifiedSessionSignature}`);
//         const cookieProp: any = {
//             expires: new Date(Date.now() + SESSION_EXPIRES_AFTER_MILLISECOUNDS),
//             overwrite: true, domain: `.${ctx.request.hostname}`
//         };
//         if (simpleIsIpv4(ctx.request.hostname)) {
//             delete cookieProp.domain;
//         }
//         ctx.cookies.set(SESSION_ID_COOKIE_NAME, verifiedSid, cookieProp);
//         ctx.cookies.set(SESSION_SIGNATURE_COOKIE_NAME, verifiedSessionSignature, cookieProp);
//     }

//     const sessionPromise: Promise<any> = sessionService.getSession(verifiedSid);

//     (ctx as Context & ContextSession).sessionId = verifiedSid;
//     (ctx as Context & ContextSession).sessionSignature = verifiedSessionSignature;
//     (ctx as Context & ContextSession).sessionToken = `${verifiedSid}:${verifiedSessionSignature}`;
//     (ctx as Context & ContextSession).sessionPromise = sessionPromise.then((x) => {
//         (ctx as Context & ContextSession).sessionData = x;

//         return x;
//     }).catch((err) => {
//         logger.error('Error while fetching session.', { err });
//     });

//     (ctx as Context & ContextSession).sessionService = sessionService;

//     (ctx as Context & ContextSession).simpleSign = (data: string) => {
//         return encodeBase64UrlSafe(sessionTokenHasher.hash(data) as Buffer);
//     };

//     return next();
// }
