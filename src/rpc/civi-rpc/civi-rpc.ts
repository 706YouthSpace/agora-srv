import {
    AbstractRPCRegistry, ApplicationError, AsyncService, extractMeta, FancyFile, LoggerInterface,
    mimeOf, restoreContentType, RPCHost, RPC_CALL_ENVIROMENT
} from "@naiverlabs/tskit";
import { container, singleton } from "tsyringe";

import { Readable } from 'stream';
import { Context, Middleware } from 'koa';
import compose from 'koa-compose';
import type KoaRouter from '@koa/router';

import globalLogger from '../../services/logger';
import { multiParse } from "./body-parser";
import { CORSAllowAllMiddleware } from "./cors";
import bodyParser from "koa-bodyparser";
import _ from "lodash";

@singleton()
export class RPCRegistry extends AbstractRPCRegistry {
    container = container;

    logger: LoggerInterface = globalLogger.child({ service: this.constructor.name });

    koaMiddlewares = [
        CORSAllowAllMiddleware,
        bodyParser({
            enableTypes: ['json', 'form', 'text'],
            extendTypes: {
                text: ['application/xml', 'text/xml']
            }
        }),
        multiParse
    ];

    registerMethodsToKoaRouter(koaRouter: KoaRouter) {
        for (const [methodName, , methodConfig] of this.dump()) {
            const httpConfig: {
                action?: string | string[];
                path?: string;
            } | undefined = methodConfig.ext?.http;

            let methods = ['post', 'get', 'options'];
            if (httpConfig?.action) {
                if (typeof httpConfig.action === 'string') {
                    methods.push(httpConfig.action);
                } else if (Array.isArray(httpConfig.action)) {
                    methods.push(...httpConfig.action);
                }
            }
            methods = _(methods).uniq().compact().map((x) => x.toLowerCase()).value();

            const theController = this.makeKoaShimController(methodName);

            if (httpConfig?.path) {
                koaRouter.register(
                    `/${httpConfig.path}`.replace(/^\/+/, '/'),
                    methods,
                    this.wipeBehindKoaRouter(
                        ...this.koaMiddlewares,
                        theController
                    )
                );
                this.logger.debug(
                    `HTTP Route: ${methods.map((x) => x.toUpperCase())} /${httpConfig.path} => rpc(${methodName})`,
                    { httpConfig }
                );
            }

            const methodNames = typeof methodConfig.name === 'string' ? [methodConfig.name] : methodConfig.name;
            for (const name of methodNames) {

                const apiPath = `/${name.split('.').join('/')}`;
                koaRouter.register(
                    apiPath,
                    methods,
                    this.wipeBehindKoaRouter(
                        ...this.koaMiddlewares,
                        theController
                    )
                );
                this.logger.debug(
                    `HTTP Route: ${methods.map((x) => x.toUpperCase())} ${apiPath} => rpc(${methodName})`,
                    { httpConfig }
                );

                const rpcPath = `/rpc/${name}`;
                koaRouter.register(
                    rpcPath,
                    methods,
                    this.wipeBehindKoaRouter(
                        ...this.koaMiddlewares,
                        theController
                    )
                );
                this.logger.debug(
                    `HTTP Route: ${methods.map((x) => x.toUpperCase())} ${rpcPath} => rpc(${methodName})`,
                    { httpConfig }
                );
            }

        }

    }

    makeSuccResponse(result: any) {
        const data = {
            code: 200,
            status: 20000,
            data: result,
            meta: extractMeta(result)
        };

        return data;
    }

    makeErrResponse(err: Error) {
        if (err instanceof ApplicationError) {
            return {
                code: err.code,
                status: err.status, data: null,
                message: `${err.name}: ${err.message}`,
                readableMessage: err.readableMessage
            };
        }

        return { code: 500, status: 50000, message: `${err.name}: ${err.message}` };
    }

    makeKoaShimController(methodName: string) {
        const conf = this.conf.get(methodName);
        if (!conf) {
            throw new Error(`Unknown rpc method: ${methodName}`);
        }
        const rpcHost = this.host(methodName) as RPCHost;
        const hostIsAsyncService = rpcHost instanceof AsyncService;

        return async (ctx: Context, next: (err?: Error) => Promise<unknown>) => {

            const jointInput = {
                ...ctx.params,
                ...ctx.query,
                ...ctx.request.body,
                [RPC_CALL_ENVIROMENT]: ctx
            };

            ctx.status = 404;
            const keepAliveTimer = setTimeout(() => {
                ctx.socket.setKeepAlive(true, 2 * 1000);
            }, 2 * 1000);

            try {
                if (hostIsAsyncService && rpcHost.serviceStatus !== 'ready') {
                    // RPC host may be crippled, if this is the case, assert its back up again.
                    this.logger.info(`${rpcHost.constructor.name} is not ready upon a request, trying to bring it up...`);
                    await rpcHost.serviceReady();
                    this.logger.info(`${rpcHost.constructor.name} recovered successfully`);
                }

                const result = await this.exec(methodName, jointInput);
                clearTimeout(keepAliveTimer);

                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                if (ctx.status === 404) {
                    ctx.status = 200;
                }
                if (result instanceof FancyFile) {
                    ctx.socket.setKeepAlive(true, 1000);
                    const resolvedFile = await result.resolve();
                    ctx.respond = false;
                    ctx.type = await result.mimeType;
                    ctx.set('content-length', (await result.size).toString());
                    resolvedFile.createReadStream().pipe(ctx.res);
                } else if (result instanceof Readable || (typeof result?.pipe) === 'function') {
                    ctx.socket.setKeepAlive(true, 1000);
                    ctx.respond = false;
                    (result as Readable).pipe(ctx.res);
                    ctx.res.once('close', () => {
                        if (!(result as Readable).readableEnded) {
                            (result as Readable).destroy(new Error('Downstream socket closed'));
                        }
                    });
                } else if (Buffer.isBuffer(result)) {
                    const mimeVec = await mimeOf(result);
                    ctx.set('content-type', restoreContentType(mimeVec));
                    ctx.body = result;
                } else {
                    const content = this.makeSuccResponse(result);
                    if (typeof content === 'object' && content !== null) {
                        ctx.set('content-type', 'application/json; charset=UTF-8');
                    }

                    ctx.body = content;
                }

            } catch (err: any) {
                clearTimeout(keepAliveTimer);
                const resp = this.makeErrResponse(err) as any;
                ctx.body = resp;
                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                ctx.status = resp.statusCode || resp.code || 500;

                this.logger.warn(`Error serving incoming request`, { brief: this.briefKoaRequest(ctx), err });
                if (err?.stack) {
                    this.logger.warn(`Stacktrace: \n`, err.stack);
                }
            }

            return next();
        };
    }

    wipeBehindKoaRouter(...middlewares: Middleware[]) {
        return compose(middlewares);
    }

    briefKoaRequest(ctx: Context) {
        return {
            code: ctx.response.status,
            resp: this.briefBody(ctx.body),

            ip: ctx.ip,
            ips: ctx.ips,
            host: ctx.host,
            method: ctx.method,
            url: ctx.request.originalUrl,
            headers: ctx.request.headers,
        };
    }

    briefBody(body: unknown) {
        if (Buffer.isBuffer(body)) {
            return `[Buffer(${body.byteLength})]`;
        }

        if (typeof (body as Readable)?.pipe === 'function') {
            return `[Stream]`;
        }

        if ((body as string)?.length > 1024) {
            return `[LargeTextAlike(${(body as string).length})]`;
        }

        return body;
    }
    override async exec(name: string, input: object) {
        this.emit('run', name, input);
        const startTime = Date.now();
        try {
            const result = await super.exec(name, input);

            this.emit('ran', name, input, result, startTime);

            return result;
        } catch (err) {

            this.emit('fail', err, name, input, startTime);

            throw err;
        }

    }
}

export interface RPCRegistry {
    on(event: 'run', listener: (name: string, input: {
        [RPC_CALL_ENVIROMENT]: any;
        [k: string]: any;
    }) => void): this;
    on(event: 'ran', listener: (name: string, input: {
        [RPC_CALL_ENVIROMENT]: any;
        [k: string]: any;
    }, result: unknown) => void, startTimeTs: number): this;
    on(event: 'fail', listener: (err: Error, name: string, input: {
        [RPC_CALL_ENVIROMENT]: any;
        [k: string]: any;
    }) => void, startTimeTs: number): this;

    on(event: 'ready', listener: () => void): this;
    on(event: 'crippled', listener: (err?: Error | any) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
}


export const rPCRegistry = container.resolve(RPCRegistry);

export const { RPCMethod, Pick, Ctx } = rPCRegistry.decorators();
