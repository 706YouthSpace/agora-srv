import { Context } from "koa";
import { wxService } from '../services/wexin';
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations, adjacencyMongoOperations } from '../db/index';
import { ParsedContext } from './middlewares/body-parser';
import { ContextRESTUtils } from './middlewares/rest';
import { ApplicationError } from '../lib/errors';
import { ObjectId } from 'mongodb';
import CrappyKoaRouterThatNeedsReplacement from 'koa-router';
import _ from 'lodash';
import { ContextValidator } from './middlewares/validator';
import { AdjacencyRecord } from '../db/adjacency';

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

const wxAppId = wxService.config.appId;

export async function wxaLoginController(ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility, next: () => Promise<unknown>) {

    const code = ctx.request.body.code;

    const user = await wxService.wxaLogin(code);

    const localUser = await userMongoOperations.wxLogin(wxAppId, user.openid, user.unionid);

    if (!localUser) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    await ctx.wxaFacl.login(wxService.config.appId, user.openid, localUser._id.toHexString(), user.session_key);

    ctx.returnData(localUser);

    return next();
}

export async function wxaGetMyProfileController(ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility, next: () => Promise<unknown>) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const brefUser = userMongoOperations.makeBrefUser(user, 'private');

    ctx.returnData(brefUser);

    return next();
}

export async function wxaGetOtherUserProfileController(
    ctx: Context & CrappyKoaRouterThatNeedsReplacement.IRouterContext &
        ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const thisUser = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!thisUser) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const queryId = ctx.query.uid || _.get(ctx, 'params.uid');

    await ctx.validator.assertValid('uid', queryId, 'ObjectId');

    const thatUserPromise = userMongoOperations.getSingleUserById(queryId);

    const friendship = await adjacencyMongoOperations.findOne(
        {
            type: 'friend',
            fromType: 'user',
            toType: 'user',
            from: new ObjectId(queryId),
            to: thisUser._id
        }
    );

    let accessLevel: 'public' | 'contact' = 'public';
    if (friendship) {
        accessLevel = 'contact';

        if (_.get(friendship, 'properties.blacklisted')) {
            accessLevel = 'public';
        }
    }

    const thatUser = await thatUserPromise;

    if (!thatUser) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40402);
    }

    const thatUserBref = userMongoOperations.makeBrefUser(thatUser, accessLevel);

    ctx.returnData(thatUserBref);

    return next();
}


export async function wxaUserBazaarController(
    ctx: Context & CrappyKoaRouterThatNeedsReplacement.IRouterContext &
        ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.isLoggedIn();

    const limit = Math.min(Math.abs(parseInt(ctx.query.limit)) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const anchor = ctx.query.anchor;

    const query: any = { activated: true, profile: { $exists: true } };

    if (ObjectId.isValid(anchor)) {
        _.set(query, '_id.$gt', new ObjectId(anchor));
    }

    if (currentUser) {
        _.set(query, '_id.$ne', new ObjectId(currentUser.cuid));
    }

    const cursor = await userMongoOperations.find(query);
    const users = await cursor.sort({ _id: -1 }).limit(limit).toArray();

    const userBrefs = users.map((x) => userMongoOperations.makeBrefUser(x));

    ctx.returnData(userBrefs);

    return next();
}

export async function wxaSetMyProfileController(ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility, next: () => Promise<unknown>) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const profileToSet = ctx.request.body;

    const newUser = await userMongoOperations.updateProfile(profileToSet, user.wxaId, user.wxOpenId);

    const brefUser = userMongoOperations.makeBrefUser(newUser!, 'private');

    ctx.returnData(brefUser);

    return next();
}


export async function wxaSetMyProfilePrivaicyController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const profilePrivaicyToSet = ctx.request.body;

    const newUser = await userMongoOperations.updatePreferences({ profilePrivacy: profilePrivaicyToSet }, user.wxaId, user.wxOpenId);

    const brefUser = userMongoOperations.makeBrefUser(newUser!, 'private');

    ctx.returnData(brefUser);

    return next();
}

export async function wxaSetPrivilegedUserController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    if (!user.privileged) {
        const somePrivilegedUser = await userMongoOperations.findOne({ wxaId: wxAppId, privileged: true });

        if (somePrivilegedUser) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40303);
        }
    }

    const queryId = ctx.query.uid || _.get(ctx, 'request.body.uid') || _.get(ctx, 'params.uid');

    const setToVal = Boolean(_.get(ctx, 'request.body.priviledged') || _.get(ctx, 'request.body.value') || true);

    let uidToSet = user._id;
    if (queryId && ObjectId.isValid(queryId)) {
        uidToSet = new ObjectId(queryId);
    }

    await userMongoOperations.updateOne({ _id: uidToSet, wxaId: wxAppId }, { $set: { privileged: setToVal } });

    ctx.returnData(setToVal);

    return next();
}

export async function wxaSetUserActivationController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    if (!user.privileged) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40303);
    }

    const queryId = ctx.query.uid || _.get(ctx, 'request.body.uid') || _.get(ctx, 'params.uid');

    await ctx.validator.assertValid('uid', queryId, 'ObjectId');

    const setToVal = Boolean(_.get(ctx, 'request.body.activated') || _.get(ctx, 'request.body.value') || true);

    await userMongoOperations.updateOne({ _id: new ObjectId(queryId), wxaId: wxAppId }, { $set: { activated: setToVal } });

    ctx.returnData(setToVal);

    return next();
}


export async function wxaFriendingController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const queryId = ctx.query.uid || _.get(ctx, 'request.body.uid') || _.get(ctx, 'params.uid');

    await ctx.validator.assertValid('uid', queryId, 'ObjectId');

    const thatUser = await userMongoOperations.getSingleUserById(queryId);

    if (!thatUser) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40402);
    }

    const action = (ctx.method === 'delete' || ctx.query.action === 'unfriend') ? 'unfriend' : 'friend';
    const blacklisted = _.get(ctx, 'request.body.blacklisted');
    if (action === 'friend') {
        await adjacencyMongoOperations.upsertRecord(
            user._id, 'user',
            new ObjectId(thatUser._id), 'user',
            'friend',
            blacklisted !== undefined ? { blacklisted: Boolean(blacklisted) } : undefined
        );
    } else if (action === 'unfriend') {
        await adjacencyMongoOperations.removeRecords(
            user._id, 'user',
            new ObjectId(thatUser._id), 'user',
            'friend'
        );
    }

    ctx.returnData(true);

    return next();
}


export async function wxaGetFriendsController(
    ctx: Context & ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.isLoggedIn();

    const queryId = ctx.query.uid || _.get(ctx, 'request.body.uid') || _.get(ctx, 'params.uid');

    let hisFriends: AdjacencyRecord[] = [];

    if (queryId) {
        await ctx.validator.assertValid('uid', queryId, 'ObjectId');

        const thatUser = await userMongoOperations.getSingleUserById(queryId);

        if (!thatUser) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40402);
        }

        hisFriends = await adjacencyMongoOperations.simpleFind(
            {
                from: thatUser._id,
                fromType: 'user',
                toType: 'user',
                type: 'friend',
                'properties.blacklisted': { $ne: true }
            },
            {
                sort: { cratedAt: -1 }
            }
        );
    } else if (currentUser) {
        hisFriends = await adjacencyMongoOperations.simpleFind(
            {
                from: new ObjectId(currentUser.cuid),
                fromType: 'user',
                toType: 'user',
                type: 'friend',
                'properties.blacklisted': { $ne: true }
            },
            {
                sort: { cratedAt: -1 }
            }
        );
    }

    if (!hisFriends.length) {

        ctx.returnData([]);

        return next();
    }


    const friendIds = hisFriends.map((x) => x.to);

    const friends = await userMongoOperations.getUsersById(friendIds);

    const friendMap = _.keyBy(friends, (x) => {
        return x._id.toHexString();
    });

    const friendIsMine = (currentUser && (currentUser.cuid === queryId || !queryId));

    const level = friendIsMine ? 'contact' : 'public';

    const brefFriends = friendIds.map((x) => userMongoOperations.makeBrefUser(friendMap[x.toHexString()], level));

    ctx.returnData(brefFriends);

    return next();
}