import { Context } from "koa";
import { Readable } from "stream";
import { RPC_CALL_ENVIROMENT, ApplicationError, extractMeta } from "tskit";
import { rPCRegistry } from "./civi-rpc";


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
    if (error instanceof ApplicationError) {
        code = Math.floor(error.status / 100);
        return {
            code,
            status: error.status, data: null,
            message: error.readableMessage || error.message,
            error: error.toObject()
        };
    }

    return { code, error };
}

export async function controllerForKoa(ctx: Context, next: (err?: Error) => Promise<unknown>) {
    const jointInput = {
        ...ctx.params,
        ...ctx.query,
        ...ctx.request.body,
        [RPC_CALL_ENVIROMENT]: ctx
    };

    ctx.status = 404;

    let methodId;
    if (ctx.request.URL.pathname === '/rpc') {
        methodId = ctx.query.method;
    } else {
        methodId = ctx.request.URL.pathname.replace(/^\/api/i, '').split('/').filter(Boolean).join('.');
    }

    const method = rPCRegistry.wrapped.get(methodId);

    if (!method) {
        return next();
    }

    const conf = rPCRegistry.conf.get(methodId)!;

    try {
        const result = await method.call(conf.host, jointInput);

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
