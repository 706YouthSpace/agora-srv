// tslint:disable: no-magic-numbers

import { Context } from "koa";
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations, postMongoOperations, fileMongoOperations, adjacencyMongoOperations } from '../db/index';
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

const fileServerBaseUri = 'https://x706.access.naiver.org/file/';

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;
const MAX_TAG_LENGTH = 10;


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

    const tags = _.get(ctx, 'request.body.tags');

    const video = _.get(ctx, 'request.body.video');

    const draft: Partial<Post> = {
        title,
        content,
        author: user._id
    };

    const files: FileRecord[] = [];

    if (images) {
        await ctx.validator.assertValid('images', images, 'ObjectId[]');
        files.push(...await fileMongoOperations.simpleFind({ _id: { $in: images.map((x: string) => new ObjectId(x)) }, owner: user._id, ownerType: 'user' }));
        if (files.length) {
            const idSet = new Set(files.map((x) => x._id.toHexString()));
            draft.images = images.filter((x: string) => idSet.has(x)).map((x: string) => new ObjectId(x));
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

    if (Array.isArray(tags) && tags.length) {
        draft.tags = _.compact(_.uniq(tags)).map((x) => x.substring(0, MAX_TAG_LENGTH));
    }

    const post = await postMongoOperations.newPost(draft);

    ctx.returnData(post);

    if (files.length) {
        await fileMongoOperations.updateMany(
            { _id: { $in: files.map((x) => x._id) } },
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

    const referenceId = _.get(ctx, 'request.body.ref') || _.get(ctx, 'request.query.ref') || _.get(ctx, 'params.ref');

    if (referenceId) {
        await ctx.validator.assertValid('refId', referenceId, 'ObjectId');
    }

    const postId = new ObjectId(commentOnId);

    const targePost = await postMongoOperations.findOne({ _id: postId }, { projection: { _terms: false } });

    if (!targePost) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40402);
    }

    const references = [targePost._id];
    if (referenceId) {
        references.push(new ObjectId(referenceId));
    }
    const title = _.get(ctx, 'request.body.title');
    const content = _.get(ctx, 'request.body.content') || title || '';

    const images = _.get(ctx, 'request.body.images');
    const video = _.get(ctx, 'request.body.video');

    const draft: Partial<Post> = {
        title,
        content,
        author: user._id,
        inReplyToPost: targePost._id,
        postReferences: references
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

    postMongoOperations.updateOne({ _id: targePost._id }, { $inc: { 'counter.comments': 1 } }).catch();

    ctx.returnData(post);

    if (files.length) {
        await fileMongoOperations.updateMany(
            { _id: { $in: files.map((x) => x._id) } },
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
    const limit = Math.min(Math.abs(parseInt(ctx.query.limit)) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const anchor = _.get(ctx, 'query.anchor') || _.get(ctx, 'request.body.anchor');

    const query: any = { blocked: { $ne: true }, inReplyToPost: { $exists: false } };
    if (anchor && ctx.validator.assertValid('anchor', `${anchor}`, 'timestamp')) {
        query.updatedAt = { $lt: parseInt(anchor) };
    }


    const posts = await postMongoOperations.simpleFind(query, { limit, sort: { updatedAt: -1 } });

    const authors = (await userMongoOperations.getUsersById(posts.map((x) => x.author))).map((x) => userMongoOperations.makeBrefUser(x));

    const authorsMap = _.keyBy(authors, (x) => x._id.toHexString());

    const patchedPosts = posts.map((post) => {
        const patchedPost: any = _.clone(post);
        patchedPost.author = authorsMap[post.author.toHexString()];
        if (post.images) {
            patchedPost.images = post.images.map(signDownloadUrl);
        }
        if (post.video) {
            patchedPost.video = signDownloadUrl(post.video);
        }

        return patchedPost;
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

    const mode = _.get(ctx, 'query.mode') || 'all';
    const query: any = { inReplyToPost: new ObjectId(postId), blocked: { $ne: true } };

    switch (mode) {
        case 'ref': {
            const refId = _.get(ctx, 'query.ref');
            await ctx.validator.assertValid('ref', refId, 'ObjectId');

            query.postReferences = refId;

            break;
        }

        case 'lv1': {

            query.postReferences = { $size: 1 };

            break;
        }

        case 'all':
        default: {
            void 0;
        }
    }

    const posts = await postMongoOperations.simpleFind(query, { sort: { createdAt: -1 } });

    const authorIds = new Set<string>();

    const patchedPosts = posts.map((post) => {
        const patchedPost: any = _.clone(post);
        authorIds.add(post.author.toHexString());
        if (post.images) {
            patchedPost.images = post.images.map(signDownloadUrl);
        }
        if (post.video) {
            patchedPost.video = signDownloadUrl(post.video);
        }

        return patchedPost;
    });

    const authors = (await userMongoOperations.getUsersById(Array.from(authorIds))).map((x) => userMongoOperations.makeBrefUser(x));

    ctx.returnData(patchedPosts, { authors });

    return next();
}

export async function likePostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {
    const action = _.get(ctx, 'request.body.action') || _.get(ctx, 'request.query.action') || ((ctx.method === 'delete') ? 'unlike' : 'like');

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const targetId = _.get(ctx, 'request.body.postId') || _.get(ctx, 'request.query.postId') || _.get(ctx, 'params.postId');

    await ctx.validator.assertValid('postId', targetId, 'ObjectId');

    const postId = new ObjectId(targetId);

    const targePost = await postMongoOperations.findOne({ _id: postId }, { projection: { _terms: false } });

    if (!targePost) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40402);
    }

    switch (action) {

        case 'unlike': {
            await adjacencyMongoOperations.updateOne(
                { from: user._id, fromType: 'user', to: targePost._id, toType: 'post', type: 'view' },
                { $set: { 'properties.liked': false } },
                { upsert: true }
            );

            postMongoOperations.updateOne({ _id: targePost._id }, { $inc: { 'counter.likes': 1 } }).catch();
            ctx.returnData(false);
            break;
        }

        default: {
            await adjacencyMongoOperations.updateOne(
                { from: user._id, fromType: 'user', to: targePost._id, toType: 'post', type: 'view' },
                { $set: { liked: true } },
                { upsert: true }
            );

            postMongoOperations.updateOne({ _id: targePost._id }, { $inc: { 'counter.likes': 1 } }).catch();
            ctx.returnData(true);
        }
    }

    return next();
}
