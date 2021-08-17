import { MongoSession } from "../../db/session";
import { ObjectId } from "mongodb";
import { RPCParam, Prop, RPC_CALL_ENVIROMENT, HMacManager, assignMeta } from "tskit";
import { autoInjectable } from 'tsyringe';
import { decodeBase64UrlSafe, encodeBase64UrlSafe } from "../../lib/binary";
import { isIPv4 } from "net";
import { IncomingMessage } from "http";
import { URL } from "url";

export const SESSION_TOKEN_HEADER_NAME = 'X-Session-Token';
export const SET_SESSION_TOKEN_HEADER_NAME = 'X-Set-Session-Token';

export const SESSION_TOKEN_COOKIE_NAME = 'st';

export const sessionHasher = new HMacManager<Buffer>('x706', 'sm3', 'buffer');

export function validSessionToken(token: string) {
    const buff = decodeBase64UrlSafe(token);
    const sid = buff.slice(0, 12);

    if (!ObjectId.isValid(sid)) {
        return false;
    }

    const objId = new ObjectId(sid);

    return buff.equals(makeSessionToken(objId));
}

export function sessionIdOf(token: string) {
    const buff = decodeBase64UrlSafe(token);
    const sid = buff.slice(0, 12);

    return new ObjectId(sid);
}

export function makeSessionToken(sid: ObjectId) {
    const sidBuff = Buffer.from(sid.toHexString(), 'hex');
    const signatureBuff = sessionHasher.sign(sidBuff);

    return Buffer.concat([sidBuff, signatureBuff]);
}

export interface ContextLike {

    request: IncomingMessage;
    get: (k: string) => string;
    set?: (k: string, v: string) => void;
    cookies?: {
        get: (k: string) => string;
        set?: (k: string, v: string, ops?: any) => void;
        [k: string]: string | any;
    }

}


@autoInjectable()
export class Session extends RPCParam<ContextLike> {

    static fromObject(input: object) {
        const parsed = super.fromObject(input) as Session;

        if (!parsed.sessionToken) {
            const sessionTokenText = parsed[RPC_CALL_ENVIROMENT]?.get(SESSION_TOKEN_HEADER_NAME) || parsed[RPC_CALL_ENVIROMENT]?.cookies?.get(SESSION_TOKEN_COOKIE_NAME);

            if (sessionTokenText && validSessionToken(sessionTokenText)) {
                parsed.sessionToken = sessionTokenText;
                parsed.sessionId = sessionIdOf(sessionTokenText);

                return parsed;
            }

            parsed.sessionId = new ObjectId();
            parsed.sessionToken = encodeBase64UrlSafe(makeSessionToken(parsed.sessionId));

            parsed.__isNew = true;

            parsed.data = {};

            return parsed;
        }

        return parsed;
    }

    __isNew: boolean = false;

    data?: { [k: string]: any };

    @Prop({
        validate: validSessionToken
    })
    sessionToken!: string;

    sessionId!: ObjectId;

    constructor(protected mongoSession: MongoSession) {
        super();
    }


    async fetch() {

        if (this.__isNew) {
            return this.data;
        }

        await this.mongoSession.serviceReady();

        this.data = await this.mongoSession.get(this.sessionId);

        return this.data;
    }

    async save() {

        if (!this.data) {
            return;
        }

        await this.mongoSession.serviceReady();

        return this.mongoSession.set(this.sessionId, this.data);
    }

    async clear() {

        await this.mongoSession.serviceReady();
        const r = await this.mongoSession.clear(this.sessionId);
        this.data = {};

        return r;
    }

    httpSetToken() {
        const ctx = this[RPC_CALL_ENVIROMENT];
        if (!ctx?.set) {
            return;
        }

        ctx.set(SET_SESSION_TOKEN_HEADER_NAME, this.sessionToken);

        if (!ctx.request.url) {
            return;
        }

        const parsedUrl = new URL(ctx.request.url);

        const cookieProp: any = {
            expires: new Date(Date.now() + 86400 * 30 * 1000),
            overwrite: true, domain: `.${parsedUrl.hostname}`
        };

        if (isIPv4(parsedUrl.hostname)) {
            delete cookieProp.domain;
        }

        if (!ctx?.cookies?.set) {
            return;
        }

        ctx.cookies.set(SESSION_TOKEN_COOKIE_NAME, this.sessionToken, cookieProp);
    }

    metaSetToken<T extends object>(tgt: T) {
        return assignMeta(tgt, { sessionToken: this.sessionToken });
    }

}
