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
import { User } from '../db/user';
import { wxService } from '../services/wexin';
import { oneOffExchangeService } from '../services/one-off-exchange';

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

    if (!user.activated) {
        throw new ApplicationError(40303, 'User not activated');
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

    if (title || content) {
        const accessToken = await wxService.localAccessToken;
        try {
            const secResult = await wxService.wxaMsgSecCheck(accessToken, `${title}\n\n${content}`);
            if (secResult.errmsg !== 'ok') {
                draft.blocked = true;
            }
        } catch (err) {
            draft.blocked = true;
        }
    }

    await postMongoOperations.dedup(draft);

    const post = await postMongoOperations.newPost(draft);


    userMongoOperations.updateOne({ _id: user._id }, { $inc: { 'counter.posts': 1 } }).catch();

    ctx.returnData(post);


    if (draft.images && draft.images.length) {
        const accessToken = await wxService.localAccessToken;
        draft.images.forEach(async (x) => {
            const url = signDownloadUrl(x);
            try {
                const r = await wxService.wxaMediaCheckAsync(accessToken, url);
                if (r.trace_id) {
                    await oneOffExchangeService.depositWithHandle(r.trace_id, x.toHexString(), 40 * 60 * 1000);
                }
            } catch (err) {
            }
        });
    }

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

// tslint:disable-next-line: cyclomatic-complexity
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

    if (!user.activated) {
        throw new ApplicationError(40303, 'User not activated');
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
        files.push(...await fileMongoOperations.simpleFind({ _id: { $in: images.map((x: string) => new ObjectId(x)) }, owner: user._id, ownerType: 'user' }));
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

    if (title || content) {
        const accessToken = await wxService.localAccessToken;
        try {
            const secResult = await wxService.wxaMsgSecCheck(accessToken, `${title}\n\n${content}`);
            if (secResult.errmsg !== 'ok') {
                draft.blocked = true;
            }
        } catch (err) {
            draft.blocked = true;
        }
    }

    await postMongoOperations.dedup(draft);

    const updatedPost = await postMongoOperations.findOneAndUpdate(
        { _id: targePost._id },
        { $inc: { 'counter.comments': 1 } },
        { returnOriginal: false }
    );

    draft.replyIndex = _.get(updatedPost, 'counter.comments');

    const post = await postMongoOperations.newPost(draft);

    const patchedPost: any = _.clone(post);
    if (post.images) {
        patchedPost.images = post.images.map(signDownloadUrl);
    }
    if (post.video) {
        patchedPost.video = signDownloadUrl(post.video);
    }

    userMongoOperations.updateOne({ _id: user._id }, { $inc: { 'counter.posts': 1 } }).catch();

    ctx.returnData(patchedPost);

    const r = next();

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

    return r;
}

async function fillAuthorAndSignUrlsForPosts(posts: Post[]) {
    const authors = (await userMongoOperations.getUsersById(posts.map((x) => x.author))).map((x) => userMongoOperations.makeBrefUser(x));

    const authorsMap = _.keyBy(authors, (x) => x._id.toHexString());

    for (const post of posts) {
        (post as any).author = authorsMap[post.author.toHexString()];
        if (post.images) {
            (post as any).images = post.images.map(signDownloadUrl);
        }
        if (post.video) {
            (post as any).video = signDownloadUrl(post.video);
        }
    }

    return posts;
}

async function fillPersonalActionsForPosts(user: User, posts: Post[]) {
    const postIndex = _.keyBy(posts, (x) => x._id.toHexString());
    const postViews = await adjacencyMongoOperations.simpleFind({
        from: user._id, fromType: 'user', to: { $in: posts.map((x) => x._id) }, toType: 'post',
        type: 'view'
    });

    for (const view of postViews) {
        if (_.get(view, 'properties.liked')) {
            const targetPost = postIndex[view.to.toHexString()];
            if (targetPost) {
                (targetPost as any).liked = true;
            }
        }
    }

    return posts;
}

// tslint:disable-next-line: cyclomatic-complexity
export async function getPostsController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {
    const limit = Math.min(Math.abs(parseInt(ctx.query.limit)) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const anchor = _.get(ctx, 'query.anchor') || _.get(ctx, 'request.body.anchor');

    const byComment = Boolean(_.get(ctx, 'query.byComment'));
    const byLikes = Boolean(_.get(ctx, 'query.byLikes'));

    const uid = _.get(ctx, 'params.uid') || _.get(ctx, 'query.uid');
    const tag = _.get(ctx, 'query.tag');

    const currentUser = await ctx.wxaFacl.isLoggedIn();
    let user: User | null = null;
    if (currentUser) {
        user = await userMongoOperations.getSingleUserById(currentUser.cuid);
    }

    const query: any = { blocked: { $ne: true }, inReplyToPost: { $exists: false } };

    if (user && user.privileged) {
        delete query.blocked;
    }

    let sort: any = { updatedAt: -1 };
    let posts;
    if (anchor) {
        await ctx.validator.assertValid('anchor', `${anchor}`, 'timestamp');
    }
    if (uid) {
        await ctx.validator.assertValid('uid', uid, 'ObjectId');
        query.author = new ObjectId(uid);
        sort = { createdAt: -1 };
        if (anchor) {
            query.createdAt = { $lt: parseInt(anchor) };
        }

        if (byComment) {
            query.inReplyToPost = { $exists: true };
            const commentedPosts = await postMongoOperations.simpleAggregate<{ _id: ObjectId; commentedAt: number }>([
                {
                    $match: query
                },
                {
                    $group: {
                        _id: '$inReplyToPost',
                        commentedAt: { $max: '$createdAt' }
                    }
                },
                {
                    $sort: { commentedAt: -1 }
                },
                {
                    $limit: limit
                }
            ]);

            const postIds = commentedPosts.map((x) => x._id);

            const postsDraft = await postMongoOperations.simpleFind(
                query.blocked ?
                    { _id: { $in: postIds }, blocked: query.blocked, inReplyToPost: { $exists: false } } :
                    { _id: { $in: postIds }, inReplyToPost: { $exists: false } }
            );
            const postIndex = _.keyBy(postsDraft, (x) => x._id.toHexString());

            posts = [];
            for (const x of commentedPosts) {
                const post = postIndex[x._id!.toHexString()];
                if (!post) {
                    continue;
                }
                (post as any).commentedAt = x.commentedAt;
                posts.push(post);
            }
        } else if (byLikes) {
            const q: any = {
                from: new ObjectId(uid), fromType: 'user', toType: 'post',
                type: 'view', 'properties.liked': true
            };
            if (anchor) {
                q.updatedAt = { $lt: anchor };
            }
            const postViews = await adjacencyMongoOperations.simpleFind(q, { sort: { updatedAt: -1 }, limit });

            const postIds = postViews.map((x) => x.to);

            const postsDraft = await postMongoOperations.simpleFind(
                query.blocked ?
                    { _id: { $in: postIds }, blocked: query.blocked, inReplyToPost: { $exists: false } } :
                    { _id: { $in: postIds }, inReplyToPost: { $exists: false } }
            );

            const postIndex = _.keyBy(postsDraft, (x) => x._id.toHexString());

            posts = [];
            for (const x of postViews) {
                const post = postIndex[x.to.toHexString()];
                if (!post) {
                    continue;
                }
                (post as any).likedAt = x.updatedAt;
                (post as any).liked = true;
                posts.push(post);
            }
        }

    } else {
        if (anchor) {
            query.updatedAt = { $lt: parseInt(anchor) };
        }

    }

    if (tag) {
        await ctx.validator.assertValid('tag', tag, 'text', 1, 128);
        query.tag = tag;
    }

    if (!posts) {
        posts = await postMongoOperations.simpleFind(query, { limit, sort });
    }


    if (currentUser && !byLikes) {
        if (!user) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40401);
        }
        await fillPersonalActionsForPosts(user, posts);
    }

    await fillAuthorAndSignUrlsForPosts(posts);

    ctx.returnData(posts);

    return next();
}

export async function getPostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.isLoggedIn();

    let user: User | null = null;
    if (currentUser) {
        user = await userMongoOperations.getSingleUserById(currentUser.cuid);
    }

    const postId = _.get(ctx, 'query.postId') || _.get(ctx, 'params.postId');

    await ctx.validator.assertValid('postId', postId, 'ObjectId');

    const post = await postMongoOperations.findOne({ _id: new ObjectId(postId) });

    if (!post) {
        throw new ApplicationError(40402);
    }

    if (post.blocked && !(user && user.privileged)) {
        throw new ApplicationError(45101);
    }

    const query: any = { inReplyToPost: new ObjectId(postId), blocked: { $ne: true } };

    if (user && user.privileged) {
        delete query.blocked;
    }

    const comments = await postMongoOperations.simpleFind(query, { sort: { createdAt: 1 } });
    const authorIds = new Set<string>();
    const postIds = new Set<string>();

    comments.forEach((comment) => {
        postIds.add(comment._id.toHexString());
        authorIds.add(comment.author.toHexString());
    });
    postIds.add(post._id.toHexString());
    authorIds.add(post.author.toHexString());

    const authors = (await userMongoOperations.getUsersById(Array.from(authorIds))).map((x) => userMongoOperations.makeBrefUser(x));
    const patchedComments = comments.map((comment) => {
        const patchedComment: any = _.clone(comment);
        if (comment.images) {
            patchedComment.images = comment.images.map(signDownloadUrl);
        }
        if (comment.video) {
            patchedComment.video = signDownloadUrl(comment.video);
        }

        return patchedComment;
    });

    const patchedPost: any = _.clone(post);
    if (post.images) {
        patchedPost.images = post.images.map(signDownloadUrl);
    }
    if (post.video) {
        patchedPost.video = signDownloadUrl(post.video);
    }
    patchedPost.comments = patchedComments;

    if (currentUser) {
        if (!user) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40401);
        }
        const postIndex = _.keyBy([patchedPost, ...patchedComments], (x) => x._id.toHexString());
        const postViews = await adjacencyMongoOperations.simpleFind({
            from: user._id, fromType: 'user', to: { $in: Array.from(postIds).map((x) => new ObjectId(x)) }, toType: 'post',
            type: 'view'
        });

        for (const view of postViews) {
            if (_.get(view, 'properties.liked')) {
                const targetPost = postIndex[view.to.toHexString()];
                if (targetPost) {
                    targetPost.liked = true;
                }
            }
        }
    }

    ctx.returnData(patchedPost, { authors });

    return next();
}

export async function getCommentsController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.isLoggedIn();
    let user: User | null = null;
    if (currentUser) {
        user = await userMongoOperations.getSingleUserById(currentUser.cuid);

        if (!user) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40401);
        }
    }

    const postId = _.get(ctx, 'query.postId') || _.get(ctx, 'params.postId');

    await ctx.validator.assertValid('postId', postId, 'ObjectId');

    const mode = _.get(ctx, 'query.mode') || 'all';
    const query: any = { inReplyToPost: new ObjectId(postId), blocked: { $ne: true } };

    if (user && user.privileged) {
        delete query.blocked;
    }

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

    const posts = await postMongoOperations.simpleFind(query, { sort: { createdAt: 1 } });

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

    if (currentUser) {
        if (!user) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40401);
        }
        const postIndex = _.keyBy(patchedPosts, (x) => x._id.toHexString());
        const postViews = await adjacencyMongoOperations.simpleFind({
            from: user._id, fromType: 'user', to: { $in: patchedPosts.map((x) => x._id) }, toType: 'post',
            type: 'view'
        });

        for (const view of postViews) {
            if (_.get(view, 'properties.liked')) {
                const targetPost = postIndex[view.to.toHexString()];
                if (targetPost) {
                    targetPost.liked = true;
                }
            }
        }
    }

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

            postMongoOperations.updateOne({ _id: targePost._id }, { $inc: { 'counter.likes': -1 } }).catch();
            ctx.returnData(false);
            break;
        }

        default: {
            await adjacencyMongoOperations.updateOne(
                { from: user._id, fromType: 'user', to: targePost._id, toType: 'post', type: 'view' },
                { $set: { 'properties.liked': true } },
                { upsert: true }
            );

            postMongoOperations.updateOne({ _id: targePost._id }, { $inc: { 'counter.likes': 1 } }).catch();
            ctx.returnData(true);
        }
    }

    return next();
}

export async function wxaSearchPostsController(
    ctx: Context & CrappyKoaRouterThatNeedsReplacement.IRouterContext &
        ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
    next: () => Promise<unknown>
) {

    // const currentUser = await ctx.wxaFacl.isLoggedIn();

    const limit = Math.min(Math.abs(parseInt(ctx.query.limit)) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const anchor = Math.abs(parseInt(ctx.query.anchor));
    const keywords = ctx.query.keywords;

    const query: any = { blocked: { $ne: true }, inReplyToPost: { $exists: false } };

    // tslint:disable-next-line: no-magic-numbers
    await ctx.validator.assertValid('keywords', keywords, 'text', 1, 64);
    let skip = 0;
    if (anchor) {
        skip = anchor;
    }
    const searchResults = await postMongoOperations.bm25Aggregate(keywords, query, limit, skip);
    // if (currentUser) {
    //     _.set(query, '_id.$ne', new ObjectId(currentUser.cuid));
    // }

    if (!(searchResults && searchResults.length)) {
        ctx.returnData([]);

        return next();
    }

    const resultIds = searchResults.map((x) => x._id);

    const posts = await postMongoOperations.simpleFind({ _id: { $in: resultIds } });

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

    const postIndex = _.keyBy(patchedPosts, (x) => x._id.toHexString());

    const currentUser = await ctx.wxaFacl.isLoggedIn();
    if (currentUser) {
        const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

        if (!user) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40401);
        }

        const postViews = await adjacencyMongoOperations.simpleFind({
            from: user._id, fromType: 'user', to: { $in: patchedPosts.map((x) => x._id) }, toType: 'post',
            type: 'view'
        });

        for (const view of postViews) {
            if (_.get(view, 'properties.liked')) {
                const targetPost = postIndex[view.to.toHexString()];
                if (targetPost) {
                    targetPost.liked = true;
                }
            }
        }
    }

    const final = [];

    for (const x of searchResults) {
        const post: any = postIndex[x._id!.toHexString()];
        post.score = x.score;
        final.push(post);
    }

    ctx.returnData(final);

    return next();
}

export async function blockPostController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {
    const setToVal = Boolean(_.get(ctx, 'request.body.blocked') || _.get(ctx, 'request.body.value') || true);

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

    await postMongoOperations.updateOne({ _id: targePost._id }, { $set: { blocked: setToVal } });

    ctx.returnData(setToVal);

    return next();
}

