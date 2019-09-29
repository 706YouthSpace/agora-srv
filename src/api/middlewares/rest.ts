
// tslint:disable: no-magic-numbers

import { Context } from 'koa';
import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';

import { logger } from '../../services/logger';
import { HTTPError } from '../../lib/http-error';
import { FancyFile } from '../../lib/fancy-file';
import { encodeBase64UrlSafe } from '../../lib/binary';

interface RESTMeta {
    // paging?: {
    //     total?: number;
    //     'page-count'?: number;
    //     'current-page'?: number;
    //     'per-page'?: number;
    //     [k: string]: number | undefined;
    // },
    [k: string]: any
}
export interface ContextRESTUtils {
    returnData: (obj: any | object | any[], meta?: RESTMeta) => void;
    returnFancyFile: (file: FancyFile, options?: { code?: number; fileName?: string }) => Promise<void>;
    returnAcception: (obj: any | object | any[], meta?: RESTMeta) => void;
    customStatus: (code: number, message: string) => void;
    scene?: string;
    requestUUID: string;
}

export async function injectRESTUtilsMiddleware(_ctx: Context, next: () => Promise<any>) {
    const ctx = _ctx as typeof _ctx & ContextRESTUtils;
    ctx.requestUUID = uuidv4();
    ctx.customStatus = (code: number, message: string) => {
        ctx.res.statusCode = code;
        if (ctx.req.httpVersionMajor < 2) ctx.res.statusMessage = message;
        (ctx as any)._explicitStatus = true;
    };
    ctx.returnData = (obj: any | any[], meta?: RESTMeta) => {
        const finalObj: any = {
            code: 200,
            status: 20000,
            message: 'OK',
            data: obj,
            uuid: ctx.requestUUID
        };
        // if (meta && meta.paging) {
        //     finalObj.paging = meta.paging;
        // }
        // const metaWithoutPaging = _.omit(meta, 'paging');
        if (!_.isEmpty(meta)) {
            finalObj.meta = meta;
        }

        ctx.status = finalObj.code;
        ctx.customStatus(finalObj.code, finalObj.message);
        ctx.body = finalObj;
    };

    ctx.returnFancyFile = async (file: FancyFile, options: { code?: number; fileName?: string } = { code: 200 }) => {

        const resolvedFile = await file.all!;

        if (options.code) {
            ctx.status = options.code;
        }
        ctx.set('Content-Type', resolvedFile.mimeType);
        ctx.set('Content-Length', resolvedFile.size.toString());
        if (options.fileName) {
            ctx.set('Content-Disposition', `attachment; filename*=utf-8''${encodeURIComponent(options.fileName)}`);
        }
        ctx.body = resolvedFile.createReadStream();
    };

    ctx.returnAcception = (obj: any | any[], meta?: RESTMeta) => {
        const finalObj: any = {
            code: 202,
            status: 20200,
            message: 'OK',
            data: obj,
            uuid: ctx.requestUUID
        };
        // if (meta && meta.paging) {
        //     finalObj.paging = meta.paging;
        // }
        // const metaWithoutPaging = _.omit(meta, 'paging');
        if (!_.isEmpty(meta)) {
            finalObj.meta = meta;
        }

        ctx.status = finalObj.code;
        ctx.customStatus(finalObj.code, finalObj.message);
        ctx.body = finalObj;
    };

    try {
        await next();
    } catch (err) {
        if (err instanceof HTTPError) {
            const exportedError = err.toObject();
            const toBeReturned: any = exportedError;
            toBeReturned.uuid = ctx.requestUUID;

            const acceptHeader = ctx.request.headers.accept || '';
            if (/^text\/html(?:,|$)/.test(acceptHeader)) {
                ctx.status = 302;
                ctx.redirect(`/error?code=${toBeReturned.code}&status=${toBeReturned.status}&message=${toBeReturned.message}` +
                    `&bin=${encodeBase64UrlSafe(Buffer.from(JSON.stringify(toBeReturned)))}`);
            } else {
                ctx.body = toBeReturned;
                ctx.status = err.code;
                // ctx.status = 200;
                ctx.type = 'json';
            }

            if (err.code >= 500 && err.code < 600) {
                logger.error(err.message, err);
            }
        } else {
            // tslint:disable-next-line:no-magic-numbers
            ctx.status = 500;
            logger.error(err.stack || err.toString(), err);
            throw err;
        }
    }

}

export function setAutoScene(omitPathPrefix: string = '') {
    return (ctx: Context & ContextRESTUtils & any, next: () => Promise<any>) => {
        const actualPathName = (ctx.request.URL.pathname || '').replace(omitPathPrefix, '');
        const paramsIdx = _.invert(ctx.params);
        const transformedPathname = actualPathName.split('/').map((x: string) => paramsIdx[x] ? `:${paramsIdx[x]}` : x).join('/');

        ctx.scene = `${ctx.request.method.toUpperCase()} ${transformedPathname}`;

        return next();
    };
}
