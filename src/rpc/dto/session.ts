import { MongoSession } from "../../db/session";
import { ObjectId } from "mongodb";
import { Prop, RPC_CALL_ENVIROMENT, HMacManager, assignMeta, Dto, AuthenticationRequiredError, AuthenticationFailedError } from "@naiverlabs/tskit";
import { decodeBase64UrlSafe, encodeBase64UrlSafe } from "../../lib/binary";
import { isIPv4 } from "net";
import { IncomingMessage } from "http";
import { URL } from "url";
import { InjectProperty } from "../../lib/property-injector";
import { MongoUser, User } from "../../db/user";
import moment from "moment";

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

export class Session extends Dto<ContextLike> {

    static override from<T = any>(input: object): T;
    static override from(input: object) {
        const parsed = super.from(input) as Session;
        if (!parsed.sessionToken) {
            const sessionTokenText = parsed[RPC_CALL_ENVIROMENT]?.get(SESSION_TOKEN_HEADER_NAME) || parsed[RPC_CALL_ENVIROMENT]?.cookies?.get(SESSION_TOKEN_COOKIE_NAME);

            // console.log(parsed[RPC_CALL_ENVIROMENT], sessionTokenText);
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

    private __fetched: boolean = false;
    __isNew: boolean = false;
    data?: { [k: string]: any };

    user?: User;

    @InjectProperty()
    protected mongoSession!: MongoSession;

    @InjectProperty()
    protected mongoUser!: MongoUser;

    @Prop({
        validate: validSessionToken
    })
    sessionToken!: string;

    sessionId!: ObjectId;

    async fetch(forced?: boolean) {

        if (!forced && (this.__isNew || this.__fetched)) {
            return this.data as { [k: string]: any };
        }

        await this.mongoSession.serviceReady();

        this.data = await this.mongoSession.getForModification(this.sessionId) || {};

        this.__fetched = true;

        return this.data as { [k: string]: any };
    }

    async save() {

        if (!this.data) {
            return;
        }

        await this.mongoSession.serviceReady();

        return this.mongoSession.set(this.sessionId, { ...this.data, expireAt: moment().add(7, 'days').toDate() });
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

        const parsedUrl = new URL(ctx.request.url, `http://${ctx.request.headers.host}`);

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

    async assertUser() {
        if (this.user) {
            return this.user;
        }

        await this.fetch();

        if (!this.data?.user) {
            throw new AuthenticationRequiredError({ message: 'User login required' });
        }

        this.user = await this.mongoUser.findOne({ _id: this.data.user });

        if (!this.user) {
            throw new AuthenticationFailedError({ message: 'Please re-login' });
        }

        return this.user;
    }

    async getUser() {
        try {
            return await this.assertUser();
        } catch (err) {
            return undefined;
        }
    }

}
