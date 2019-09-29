// tslint:disable: no-magic-numbers

import { Context } from 'koa';

export function CORSAllowOnceMiddleware(ctx: Context, next: () => Promise<any>) {
    if (ctx.method.toUpperCase() !== 'OPTIONS') {
        return next();
    }
    const requestOrigin = ctx.request.header.origin;
    if (!requestOrigin) {
        return next();
    }
    ctx.response.set('Access-Control-Allow-Origin', requestOrigin);

    const customMethod = ctx.request.header['Access-Control-Request-Method'.toLowerCase()];
    const customHeaders = ctx.request.header['Access-Control-Request-Headers'.toLowerCase()];
    if (customMethod) {
        ctx.response.set('Access-Control-Allow-Methods', customMethod);
    }
    if (customHeaders) {
        ctx.response.set('Access-Control-Allow-Headers', customHeaders);
    }
    ctx.response.set('Access-Control-Allow-Credentials', 'true');

    ctx.status = 200;

    return next();
}

export function CORSAllowAllMiddleware(ctx: Context, next: () => Promise<any>) {
    const requestOrigin = ctx.request.header.origin;
    if (!requestOrigin) {
        return next();
    }
    ctx.response.set('Access-Control-Allow-Origin', requestOrigin);
    ctx.response.set('Access-Control-Max-Age', '25200');
    ctx.response.set('Access-Control-Allow-Credentials', 'true');
    if (ctx.method.toUpperCase() !== 'OPTIONS') {
        return next();
    }
    ctx.status = 200;
    const customMethod = ctx.request.header['Access-Control-Request-Method'.toLowerCase()];
    const customHeaders = ctx.request.header['Access-Control-Request-Headers'.toLowerCase()];
    if (customMethod) {
        ctx.response.set('Access-Control-Allow-Methods', ['GET', 'POST', 'OPTIONS', 'HEAD', 'PUT', 'DELETE', 'PATCH', 'TRACE'].join(','));
    }
    if (customHeaders) {
        ctx.response.set('Access-Control-Allow-Headers', customHeaders);
    }

    return next();
}
