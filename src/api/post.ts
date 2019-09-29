import { Context } from "koa";
import { wxService } from '../services/wexin';
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations, adjacencyMongoOperations } from '../db/index';
import { ParsedContext } from './middlewares/body-parser';
import { ContextRESTUtils } from './middlewares/rest';
import { ApplicationError } from '../lib/errors';
import { ObjectId } from 'mongodb';
import _ from 'lodash';
import { ContextValidator } from './middlewares/validator';
import { AdjacencyRecord } from '../db/adjacency';

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

    return next();
}
