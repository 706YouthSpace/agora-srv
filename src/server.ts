import 'reflect-metadata';

import os from 'os';
import Koa, { Next, Context } from 'koa';
import KoaRouter from '@koa/router';
import http, { Server } from 'http';
import { container, singleton } from 'tsyringe';

import { Logger } from './services/logger';
import { Config } from './config';
import { App } from './rpc';
import { AsyncService, runOnce } from '@naiverlabs/tskit';
import { RPCRegistry } from './rpc/civi-rpc';
@singleton()
export class AppServer extends AsyncService {
    healthCheckEndpoint = '/ping';

    koaApp: Koa = new Koa();
    koaRootRouter: KoaRouter = new KoaRouter();

    httpServer!: Server;

    constructor(
        public config: Config,
        public logger: Logger,
        public rpcHosts: App,
        public rpcRegistry: RPCRegistry
    ) {
        super(...arguments);
        this.koaApp.proxy = true;
        this.init()
            .catch((err) => {
                this.logger.error(`Server start failed: ${err.toString()}`, err);
                if (err.stack) {
                    this.logger.error(`Stacktrace: \n${err?.stack}`);
                }
                (this.logger.logger as any).flush();
                setImmediate(() => process.exit(1));
            });
    }

    override async init() {
        this.logger.serviceReady().then(() => {
            this.logger.info(`Server starting at ${os.hostname()}(${process.pid}) ${os.platform()}_${os.release()}_${os.arch()}`);
        });

        await this.dependencyReady();

        this.insertHealthCheckMiddleware(this.healthCheckEndpoint);
        this.insertLogRequestsMiddleware();

        if (!this.config.get('debug')) {
            this.logger.debug('Debug disabled');
        }

        this.koaApp.use(this.koaRootRouter.routes());

        this.logger.info('Server dependency ready');

        process.on('uncaughtException', (err: any) => {
            this.logger.error(`Uncaught exception in pid ${process.pid}, quitting`, {
                pid: process.pid,
                err
            });
            this.logger.error(`Stacktrace: \n${err?.stack}`);

            (this.logger.logger as any).flush();
            setImmediate(() => process.exit(1));
        });

        process.on('unhandledRejection', (err: any) => {
            this.logger.warn(`Unhandled promise rejection in pid ${process.pid}`, {
                pid: process.pid,
                err
            });
            this.logger.warn(`Stacktrace: \n${err?.stack}`);
        });

        this.httpServer = http.createServer(this.koaApp.callback());

        this.emit('ready');
    }

    @runOnce()
    async listen() {
        await this.serviceReady();
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        const port = this.config.get('port') || 3000;
        this.httpServer.listen(port, () => {
            this.logger.info(`Server listening on port ${port}`);
        });
    }


    @runOnce()
    spinUpAPI() {
        const router = new KoaRouter();

        this.rpcRegistry.registerMethodsToKoaRouter(router);

        this.koaRootRouter.use('/api', router.routes(), router.allowedMethods());
    }


    @runOnce()
    insertLogRequestsMiddleware() {

        const loggingMiddleware = async (ctx: Context, next: Next) => {
            const startedAt = Date.now();
            if (['GET', 'DELETE', 'HEAD'].includes(ctx.method.toUpperCase())) {
                this.logger.info(`Incoming request: ${ctx.request.method.toUpperCase()} ${ctx.request.originalUrl} ${ctx.ip}`, { service: 'HTTP Server' });
            } else {
                this.logger.info(`Incoming request: ${ctx.request.method.toUpperCase()} ${ctx.request.originalUrl} ${ctx.request.type || 'unspecified-type'} ${humanReadableDataSize(ctx.request.get('content-length') || ctx.request.socket.bytesRead) || 'N/A'} ${ctx.ip}`, { service: 'HTTP Server' });
            }

            ctx.res.once('close', () => {
                const duration = Date.now() - startedAt;
                this.logger.info(`Request completed: ${ctx.status} ${ctx.request.method.toUpperCase()} ${ctx.request.originalUrl} ${ctx.response.type || 'unspecified-type'} ${humanReadableDataSize(ctx.response.get('content-length') || ctx.res.socket?.bytesWritten) || 'cancelled'} ${duration}ms`, { service: 'HTTP Server' });
            });

            return next();
        };

        this.koaApp.use(loggingMiddleware);
    }

    @runOnce()
    insertHealthCheckMiddleware(path: string = '/ping') {

        const healthCheck = async (ctx: Context, next: Next) => {
            if (ctx.path !== path) {
                return next();
            }

            // No next() from here, so it returns directly without waking up any downstream logic.
            if (this.serviceStatus === 'ready') {
                ctx.status = 200;
                ctx.body = 'pone';

                return;
            }

            try {
                await this.serviceReady();

                ctx.status = 200;
                ctx.body = 'pone';

            } catch (err: any) {
                ctx.status = 503;
                ctx.body = err.toString();

                this.logger.error('Service not ready upon health check', { err });
            }
        };

        this.koaApp.use(healthCheck);
    }
}

function humanReadableDataSize(size: number | string | void) {

    const parsed = parseInt(size as any, 10);
    if (!parsed) {
        return undefined;
    }

    const i = Math.floor(Math.log(parsed) / Math.log(1024));
    const n = parsed / Math.pow(1024, i);
    return n.toFixed(2) + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}


export const appServer = container.resolve(AppServer);

export default appServer;
