import { Context } from "koa";
import { Readable } from "stream";
import { RPC_CALL_ENVIROMENT, ApplicationError, extractMeta } from "@naiverlabs/tskit";
import { rPCRegistry } from "./civi-rpc";

import stuff from './loader';

stuff.load();

function makeSuccResponse(result: any) {

    const data = {
        code: 200,
        status: 20000,
        data: result,
        meta: extractMeta(result)
    };

    return data;
}

function makeErrResponse(error: Error) {
    let code = 500;

    console.warn(error, error.stack);
    if (error instanceof ApplicationError) {
        code = Math.floor(error.status / 100);
        return {
            code,
            status: error.status, data: null,
            message: error.readableMessage || error.message,
            error: error.toObject(),
        };
    }

    return { code, error };
}

export async function shimControllerForKoa(ctx: Context, next: (err?: Error) => Promise<unknown>) {
    const jointInput = {
        ...ctx.params,
        ...ctx.query,
        ...ctx.request.body,
        [RPC_CALL_ENVIROMENT]: ctx
    };

    ctx.status = 404;

    let methodId;
    const pathName = ctx.request.URL.pathname;
    if (pathName === '/rpc') {
        methodId = ctx.query.method;
    } else if (pathName.startsWith('/api')) {
        methodId = ctx.request.URL.pathname.replace(/^\/api/i, '').split('/').filter(Boolean).join('.');
    }

    if (!methodId) {
        return next();
    }


    try {
        const result = await rPCRegistry.exec(methodId, jointInput);

        if (ctx.status === 404) {
            ctx.status = 200;
        }
        if (result instanceof Readable || (typeof result?.pipe) === 'function') {
            ctx.respond = false;
            (result as Readable).pipe(ctx.res);
        } else if (Buffer.isBuffer(result)) {
            ctx.body = result;
        } else {
            ctx.body = makeSuccResponse(result);
        }

    } catch (err: any) {
        ctx.body = makeErrResponse(err);
        ctx.status = ctx.body.code;
    }

    return next();
}
