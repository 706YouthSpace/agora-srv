import koa from 'koa';

import koaLogger from 'koa-logger';

import Router from 'koa-router';

// import { wxPlatformLandingController } from './wx-platform';
import koaBody from 'koa-body';
import send from 'koa-send';
import fs from 'fs';
import path from 'path';
import static from 'koa-static';

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

app.use(koaBody({
    multipart: true,
    encoding:'gzip',
    formidable: {
        maxFileSize: 10*1024*1024,    // 设置上传文件大小最大限制
        uploadDir: '/data/agora-srv/uploadFiles/' ,     // uploadDir:,  '/data/upload/' , path.join(__dirname,'/upload/')  // 设置文件上传目录
        keepExtensions: true,    // 保持文件的后缀
        onFileBegin: (_name: any, file:any)=>{    // 文件存储之前对文件进行重命名处理
            
            // const fileFormat = file.name.split('.');
            // file.name = `${fileFormat[fileFormat.length-2]}_${Date.parse(new Date().toString())}.${fileFormat[fileFormat.length-1]}`
            // file.path = `upload/${file.name}`;
        }
    }
}));

app.use(multiParse);
app.use(static("/data/agora-srv/uploadFiles/"));


const router = new Router<any, any>();

router.get('/ping', (ctx, next) => {
    ctx.body = 'success';

    return next();
});

// router.get('/wx-platform/landing', wxPlatformLandingController);
// router.post('/wx-platform/landing', wxPlatformLandingController);

router.get('/test', (ctx) => {
    // 设置头类型, 如果不设置，会直接下载该页面
    ctx.type = 'html';
    // 读取文件
    const pathUrl = path.join(__dirname, '/test.html');
    ctx.body = fs.createReadStream(pathUrl);
  });

router.post('/upload', async (ctx)=>{
    // const storePath = '/data/upload/';
    // if (!fs.existsSync(storePath)) {
    //     fs.mkdir(storePath, (err) => {
    //         if (err) {
    //             throw new Error(err.message );
    //         } else {
            
    //         }
    //     });
    // }
    const filePath = ctx.request.files.file.path;    // 获取上传文件
    return ctx.body = filePath.substr(filePath.lastIndexOf("/")+1,filePath.length);;    // upload/xxx.xx
})

router.get('/download', async (ctx) => {
    const originalUrl = ctx.originalUrl;
    const name=originalUrl.substr(originalUrl.indexOf("=")+1,originalUrl.length);
    const path = `/uploadFiles/${name}`;
    ctx.attachment(path);
    await send(ctx, path);
})

app.use(router.middleware());
app.use(router.allowedMethods());

// All our rpc business logic gets injected here.
app.use(shimControllerForKoa);
