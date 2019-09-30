import { Context } from "koa";
import { wxService } from '../services/wexin';
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations, adjacencyMongoOperations, postMongoOperations } from '../db/index';
import { ParsedContext } from './middlewares/body-parser';
import { ContextRESTUtils } from './middlewares/rest';
import { ApplicationError } from '../lib/errors';
import { ObjectId } from 'mongodb';
import _ from 'lodash';
import { ContextValidator } from './middlewares/validator';
import { AdjacencyRecord } from '../db/adjacency';
import CrappyKoaRouterThatNeedsReplacement from 'koa-router';

export async function createNewPostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
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

    const post = await postMongoOperations.newPost({
        title,
        content,
        author: user._id
    });

    ctx.returnData(post);

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

    const post = await postMongoOperations.newPost({
        title,
        content,
        author: user._id,
        inReplyToPost: targePost._id
    });

    ctx.returnData(post);

    return next();
}
