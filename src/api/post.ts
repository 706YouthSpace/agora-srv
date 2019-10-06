// tslint:disable: no-magic-numbers

import { Context } from "koa";
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations, postMongoOperations, fileMongoOperations } from '../db/index';
import { ParsedContext, ContextFileUtils } from './middlewares/body-parser';
import { ContextRESTUtils } from './middlewares/rest';
import { ApplicationError } from '../lib/errors';
import { ObjectId } from 'mongodb';
import _ from 'lodash';
import { ContextValidator } from './middlewares/validator';
import CrappyKoaRouterThatNeedsReplacement from 'koa-router';
import { Post } from '../db/post';
import { FileRecord } from '../db/file';
import { urlSignatureManager } from '../services/url-signature';

const fileServerBaseUri = 'https://x706-file.local.naiver.org:8083/file/';

function signDownloadUrl(fileId: ObjectId) {
    const ts = Date.now() + 1800 * 1000;
    const signature = urlSignatureManager.signature({ fileId: fileId.toHexString(), timestamp: ts.toString() });

    return `${fileServerBaseUri}${fileId.toHexString()}?ts=${ts}&sig=${signature}`;
}

export async function createNewPostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & ContextFileUtils,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const title = _.get(ctx, 'request.body.title');
    const content = _.get(ctx, 'request.body.content') || title || '';

    const images = _.get(ctx, 'request.body.images');
    const video = _.get(ctx, 'request.body.video');

    const draft: Partial<Post> = {
        title,
        content,
        author: user._id
    };

    const files: FileRecord[] = [];

    if (images) {
        await ctx.validator.assertValid('images', images, 'ObjectId[]');
        files.push(...await fileMongoOperations.simpleFind({ $in: { _id: images.map((x: string) => new ObjectId(x)) }, owner: user._id, ownerType: 'user' }));
        if (files.length) {
            draft.images = files.map((x) => x._id);
        }
    }

    if (video) {
        await ctx.validator.assertValid('video', video, 'ObjectId');
        const file = await fileMongoOperations.findOne({ _id: new ObjectId(video), owner: user._id, ownerType: 'user' });
        if (file) {
            files.push(file);
            draft.video = file._id;
        }
    }

    const post = await postMongoOperations.newPost(draft);

    ctx.returnData(post);

    if (files.length) {
        await fileMongoOperations.updateMany(
            { $in: { _id: files.map((x) => x._id) } },
            {
                $set: {
                    owner: post._id,
                    ownerType: 'post',
                    updatedAt: Date.now()
                }
            }
        );
    }

    return next();
}

export async function commentOnPostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const commentOnId = _.get(ctx, 'request.body.postId') || _.get(ctx, 'request.query.postId') || _.get(ctx, 'params.postId');

    await ctx.validator.assertValid('postId', commentOnId, 'ObjectId');

    const postId = new ObjectId(commentOnId);

    const targePost = await postMongoOperations.findOne({ _id: postId });

    if (!targePost) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40402);
    }

    const title = _.get(ctx, 'request.body.title');
    const content = _.get(ctx, 'request.body.content') || title || '';

    const images = _.get(ctx, 'request.body.images');
    const video = _.get(ctx, 'request.body.video');

    const draft: Partial<Post> = {
        title,
        content,
        author: user._id,
        inReplyToPost: targePost._id
    };

    const files: FileRecord[] = [];

    if (images) {
        await ctx.validator.assertValid('images', images, 'ObjectId[]');
        files.push(...await fileMongoOperations.simpleFind({ $in: { _id: images.map((x: string) => new ObjectId(x)) }, owner: user._id, ownerType: 'user' }));
        if (files.length) {
            draft.images = files.map((x) => x._id);
        }
    }

    if (video) {
        await ctx.validator.assertValid('video', video, 'ObjectId');
        const file = await fileMongoOperations.findOne({ _id: new ObjectId(video), owner: user._id, ownerType: 'user' });
        if (file) {
            files.push(file);
            draft.video = file._id;
        }
    }

    const post = await postMongoOperations.newPost(draft);

    ctx.returnData(post);

    if (files.length) {
        await fileMongoOperations.updateMany(
            { $in: { _id: files.map((x) => x._id) } },
            {
                $set: {
                    owner: post._id,
                    ownerType: 'post',
                    updatedAt: Date.now()
                }
            }
        );
    }

    return next();
}

export async function getPostsController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    // const currentUser = await ctx.wxaFacl.isLoggedIn();

    // if (currentUser) {
    //     const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    //     if (!user) {
    //         // tslint:disable-next-line: no-magic-numbers
    //         throw new ApplicationError(40401);
    //     }
    // }

    const anchor = _.get(ctx, 'query.anchor') || _.get(ctx, 'request.body.anchor');

    const query: any = { blocked: { $ne: true }, inReplyToPost: { $exists: false } };
    if (anchor && ctx.validator.assertValid('anchor', `${anchor}`, 'timestamp')) {
        query.updatedAt = { $gte: parseInt(anchor) };
    }


    const posts = await postMongoOperations.simpleFind(query, { sort: { updatedAt: -1 } });

    const patchedPosts = posts.map((post) => {
        const patchedPost: any = _.clone(post);
        if (post.images) {
            patchedPost.images = post.images.map(signDownloadUrl);
        }
        if (post.video) {
            patchedPost.video = signDownloadUrl(post.video);
        }
    });


    ctx.returnData(patchedPosts);

    return next();
}

export async function getPostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    // const currentUser = await ctx.wxaFacl.isLoggedIn();

    // if (currentUser) {
    //     const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    //     if (!user) {
    //         // tslint:disable-next-line: no-magic-numbers
    //         throw new ApplicationError(40401);
    //     }
    // }

    const postId = _.get(ctx, 'query.postId') || _.get(ctx, 'params.postId');

    await ctx.validator.assertValid('postId', postId, 'ObjectId');

    const post = await postMongoOperations.findOne({ _id: new ObjectId(postId) });

    if (!post) {
        throw new ApplicationError(40402);
    }

    if (post.blocked) {
        throw new ApplicationError(45101);
    }

    const patchedPost: any = _.clone(post);
    if (post.images) {
        patchedPost.images = post.images.map(signDownloadUrl);
    }
    if (post.video) {
        patchedPost.video = signDownloadUrl(post.video);
    }


    ctx.returnData(patchedPost);

    return next();
}

export async function getCommentsController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    // const currentUser = await ctx.wxaFacl.isLoggedIn();

    // if (currentUser) {
    //     const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    //     if (!user) {
    //         // tslint:disable-next-line: no-magic-numbers
    //         throw new ApplicationError(40401);
    //     }
    // }

    const postId = _.get(ctx, 'query.postId') || _.get(ctx, 'params.postId');

    await ctx.validator.assertValid('postId', postId, 'ObjectId');

    const posts = await postMongoOperations.simpleFind({ inReplyToPost: new ObjectId(postId), blocked: { $ne: true } }, { sort: { createdAt: -1 } });

    const patchedPosts = posts.map((post) => {
        const patchedPost: any = _.clone(post);
        if (post.images) {
            patchedPost.images = post.images.map(signDownloadUrl);
        }
        if (post.video) {
            patchedPost.video = signDownloadUrl(post.video);
        }
    });


    ctx.returnData(patchedPosts);


    return next();
}
