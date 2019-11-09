// tslint:disable: no-magic-numbers
import { Context } from "koa";
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations } from '../db';
import { ParsedContext, ContextFileUtils } from './middlewares/body-parser';
import { ContextRESTUtils } from './middlewares/rest';
import { ApplicationError } from '../lib/errors';
import _ from 'lodash';
import { ContextValidator } from './middlewares/validator';
import CrappyKoaRouterThatNeedsReplacement from 'koa-router';
import { wtmQuotaOperations } from '../db/index';


export async function addTplMsgQuotaController(
    ctx: Context &
        ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator &
        ContextFileUtils & ContextFileUtils & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {
    let token: undefined | string;

    await ctx.validator.assertValid('token', token, 'text', 5, 128);

    const type = ctx.body.type;

    switch (type) {

        case 'form': {

            token = ctx.body.formId;

            // Real formIds were not likely to contain spaces.
            if (!token || token.indexOf(' ') >= 0) {
                ctx.returnData(false);
                
                return next();
            }

            break;
        }

        default: {
            throw new ApplicationError(40003, 'type');
        }
    }

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        throw new ApplicationError(40401);
    }

    await wtmQuotaOperations.addNewQuotaFor(user.wxaId, user._id, user.wxOpenId, token, type);

    ctx.returnData(true);

    return next();
}

