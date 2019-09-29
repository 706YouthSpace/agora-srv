import { Context } from 'koa';

export async function noCacheMiddleware(ctx: Context, next: () => Promise<any>) {

    try {
        await next();
    } catch (err) {
        ctx.response.header.set('Cache-Control', 'no-cache');
        throw err;
    }


}
