import koa from 'koa';

import koaLogger from 'koa-logger';

import Router from 'koa-router';

import { wxPlatformLandingController } from './wx-platform';

import {
    wxaLoginController, wxaGetMyProfileController, wxaGetOtherUserProfileController,
    wxaUserBazaarController, wxaSetMyProfileController, wxaSetMyProfilePrivaicyController,
    wxaSetPrivilegedUserController, wxaSetUserActivationController, wxaFriendingController,
    wxaGetFriendsController
} from './user';

import bodyParser from 'koa-bodyparser';
import { CORSAllowAllMiddleware } from './middlewares/cors';
import { injectRESTUtilsMiddleware } from './middlewares/rest';
import { injectLoggerMiddleware } from './middlewares/logger';
import { injectValidatorMiddleware } from './middlewares/validator';
import { multiParse } from './middlewares/body-parser';
import { uploadFileToPersonalDrive } from './file';
import { createNewPostController, commentOnPostController, getPostsController, getPostController, getCommentsController } from './post';

export const app = new koa<any, any>();


app.use(koaLogger());
app.use(CORSAllowAllMiddleware);
app.use(injectRESTUtilsMiddleware);
app.use(injectLoggerMiddleware);
app.use(injectValidatorMiddleware);

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

router.post('/wx-platform/landing', wxPlatformLandingController);

router.post('/login', wxaLoginController);

router.get('/my/profile', wxaGetMyProfileController);
router.post('/my/profile', wxaSetMyProfileController);
router.patch('/my/profile', wxaSetMyProfileController);

router.post('/my/preferences/profilePrivaicy', wxaSetMyProfilePrivaicyController);
router.patch('/my/preferences/profilePrivaicy', wxaSetMyProfilePrivaicyController);

router.get('/my/friends', wxaGetFriendsController);
router.post('/my/friends', wxaFriendingController);
router.patch('/my/friends', wxaFriendingController);

router.post('/my/files', uploadFileToPersonalDrive);


router.get('/users', wxaUserBazaarController);
router.post('/su', wxaSetPrivilegedUserController);

router.get('/user/:uid/profile', wxaGetOtherUserProfileController);

router.post('/user/:uid/activated', wxaSetUserActivationController);

router.get('/user/:uid/friends', wxaGetFriendsController);

router.post('/posts', createNewPostController);

router.post('/post/:postId', commentOnPostController);

router.get('/posts', getPostsController);
router.get('/post/:postId', getPostController);

router.get('/post/:postId', getPostController);
router.get('/post/:postId/comments', getCommentsController);


app.use(router.middleware());
app.use(router.allowedMethods());
