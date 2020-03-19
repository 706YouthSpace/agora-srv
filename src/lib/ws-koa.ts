import Koa, { Context } from 'koa';
import { Server, IncomingMessage, ServerResponse } from 'http';
import ws from 'ws';
import compose from 'koa-compose';
import { Socket } from 'net';
import { Defer } from './defer';

export interface UpgradedContext extends Context {
    isFake?: false;
    upgrade?: [IncomingMessage, Socket, Buffer];
    handleUpgrade?: (srv: ws.Server, ...anythingElse: any[]) => Promise<ws>;
}

const HTTP_STATUS_CODE_CONTINUE = 101;

export function upgradeToKoa(koaApp: Koa, server: Server) {

    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const fn = compose(koaApp.middleware);
        const realResponse = new ServerResponse(request);
        realResponse.assignSocket(socket);

        const ctx: any = koaApp.createContext(request, realResponse as any);

        ctx.isFake = true;
        ctx.upgrade = [request, socket, head];
        let handled = false;
        ctx.handleUpgrade = (srv: ws.Server, ...anythingElse: any[]) => {
            realResponse.detachSocket(socket);
            const deferred = Defer();
            srv.handleUpgrade(request, socket, head, (client) => {
                if (client) {
                    deferred.resolve(client);
                    if (srv.options.noServer) {
                        srv.emit('connection', client, ...anythingElse);
                    }

                    return;
                }

                return deferred.reject(client);
            });
            handled = true;
            ctx.status = HTTP_STATUS_CODE_CONTINUE;

            return deferred.promise;
        };

        const koaPromise = (koaApp as any).handleRequest(ctx, fn);

        koaPromise.then(() => {
            if (handled) {

                realResponse.emit('finish');

                return;
            }
        });
    });

}
