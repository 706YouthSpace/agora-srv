import { Context } from "koa";
import { SessionWxaFacility } from './middlewares/session-wxa';
import { userMongoOperations, fileMongoOperations, dirMongoOperations } from '../db/index';
import { ParsedContext, ContextFileUtils } from './middlewares/body-parser';
import { ContextRESTUtils } from './middlewares/rest';
import { ApplicationError } from '../lib/errors';
import { ObjectId } from 'mongodb';
import _ from 'lodash';
import { ContextValidator } from './middlewares/validator';
import CrappyKoaRouterThatNeedsReplacement from 'koa-router';
import { sha256Storage } from '../services/storage';
import { DirRecord } from '../db/dir';

export async function uploadFileToPersonalDrive(
    ctx: Context &
        ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator &
        ContextFileUtils & ContextFileUtils & CrappyKoaRouterThatNeedsReplacement,
    next: () => Promise<unknown>
) {

    const currentUser = await ctx.wxaFacl.assertLoggedIn();

    const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

    if (!user) {
        // tslint:disable-next-line: no-magic-numbers
        throw new ApplicationError(40401);
    }

    const files = ctx.files;

    const targetId = _.get(ctx, 'request.body.target') || _.get(ctx, 'request.body.host') || _.get(ctx, 'request.params.targetId');

    let targetDir: DirRecord | undefined | null;
    if (targetDir) {
        await ctx.validator.assertValid('targetDir', targetId, 'ObjectId');
        targetDir = await dirMongoOperations.findOne({ _id: new ObjectId(targetId) });
        if (!targetDir) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40402);
        }
    }

    const fileRecords = await Promise.all(files.map(async (file) => {
        const fileHash = await file.sha256Sum;
        await sha256Storage.storeFancyFile(file, fileHash);
        const fileRecord = await fileMongoOperations.newRecord(
            targetDir ? targetDir._id : user._id,
            targetDir ? 'dir' : 'user',
            fileHash, file.claimedName || 'file.bin',
            file.claimedMime,
        );

        return fileRecord;
    }));


    ctx.returnData(fileRecords.length > 1 ? fileRecords : fileRecords[0]);

    return next();
}

