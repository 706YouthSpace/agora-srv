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
            draft.images = files.map((x) => x.sha256SumHex);
        }
    }

    if (video) {
        await ctx.validator.assertValid('video', video, 'ObjectId');
        const file = await fileMongoOperations.findOne({ _id: new ObjectId(video), owner: user._id, ownerType: 'user' });
        if (file) {
            files.push(file);
            draft.video = video;
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
            draft.images = files.map((x) => x.sha256SumHex);
        }
    }

    if (video) {
        await ctx.validator.assertValid('video', video, 'ObjectId');
        const file = await fileMongoOperations.findOne({ _id: new ObjectId(video), owner: user._id, ownerType: 'user' });
        if (file) {
            files.push(file);
            draft.video = video;
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
