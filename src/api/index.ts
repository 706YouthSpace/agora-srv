import koa from 'koa';

import koaLogger from 'koa-logger';

import Router from 'koa-router';

// import { wxPlatformLandingController } from './wx-platform';

import bodyParser from 'koa-bodyparser';
import { CORSAllowAllMiddleware } from './middlewares/cors';
import { injectLoggerMiddleware } from './middlewares/logger';


import { multiParse } from './middlewares/body-parser';


import { shimControllerForKoa } from '../rpc/shim-koa';

export const app = new koa<any, any>();


app.use(koaLogger());
app.use(CORSAllowAllMiddleware);
app.use(injectLoggerMiddleware);

app.use(bodyParser({
    enableTypes: ['json', 'form', 'text'],
    extendTypes: {
        text: ['application/xml', 'text/xml']
    }
}));

app.use(multiParse);


const router = new Router<any, any>();

router.get('/ping', (ctx, next) => {
    ctx.body = 'success';

    return next();
});

// router.get('/wx-platform/landing', wxPlatformLandingController);
// router.post('/wx-platform/landing', wxPlatformLandingController);


app.use(router.middleware());
app.use(router.allowedMethods());

// All our rpc business logic gets injected here.
app.use(shimControllerForKoa);
