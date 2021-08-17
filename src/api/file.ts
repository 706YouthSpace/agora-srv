// // tslint:disable: no-magic-numbers
// import { Context } from "koa";
// import { SessionWxaFacility } from './middlewares/session-wxa';
// import { userMongoOperations, fileMongoOperations, dirMongoOperations } from '../db/index';
// import { ParsedContext, ContextFileUtils } from './middlewares/body-parser';
// import { ContextRESTUtils } from './middlewares/rest';
// import { ApplicationError } from '../lib/errors';
// import { ObjectId } from 'mongodb';
// import _ from 'lodash';
// import { ContextValidator } from './middlewares/validator';
// import CrappyKoaRouterThatNeedsReplacement from 'koa-router';
// import { sha256Storage } from '../services/storage';
// import { DirRecord } from '../db/dir';
// import { urlSignatureManager } from '../services/url-signature';
// import { HashManager } from '../lib/hash';

// import gm from 'gm';

// const thumbHashManager = new HashManager('sha1', 'hex');

// export async function uploadFileToPersonalDrive(
//     ctx: Context &
//         ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator &
//         ContextFileUtils & ContextFileUtils & CrappyKoaRouterThatNeedsReplacement,
//     next: () => Promise<unknown>
// ) {

//     const currentUser = await ctx.wxaFacl.assertLoggedIn();

//     const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

//     if (!user) {
//         throw new ApplicationError(40401);
//     }

//     const files = ctx.files;

//     const targetId = _.get(ctx, 'request.body.target') || _.get(ctx, 'request.body.host') || _.get(ctx, 'params.targetId');

//     let targetDir: DirRecord | undefined | null;
//     if (targetDir) {
//         await ctx.validator.assertValid('targetDir', targetId, 'ObjectId');
//         targetDir = await dirMongoOperations.findOne({ _id: new ObjectId(targetId) });
//         if (!targetDir) {
//             throw new ApplicationError(40402);
//         }
//     }

//     const fileRecords = await Promise.all(files.map(async (file) => {
//         const fileHash = await file.sha256Sum;
//         const fileSize = await file.size;
//         await sha256Storage.storeFancyFile(file, fileHash);
//         const fileRecord = await fileMongoOperations.newRecord(
//             targetDir ? targetDir._id : user._id,
//             targetDir ? 'dir' : 'user',
//             fileHash, file.claimedName || 'file.bin',
//             file.claimedMime,
//             fileSize
//         );

//         return fileRecord;
//     }));


//     ctx.returnData(fileRecords.length > 1 ? fileRecords : fileRecords[0]);

//     return next();
// }

// export async function getFileController(
//     ctx: Context &
//         ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator &
//         ContextFileUtils & ContextFileUtils & CrappyKoaRouterThatNeedsReplacement,
//     next: () => Promise<unknown>
// ) {
//     // const currentUser = await ctx.wxaFacl.assertLoggedIn();

//     // const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

//     // if (!user) {
//     //     throw new ApplicationError(40401);
//     // }

//     const fileId = _.get(ctx, 'params.fileId');
//     const timestamp = _.get(ctx, 'query.ts');
//     const signature = _.get(ctx, 'query.sig');
//     const download = _.get(ctx, 'query.download');
//     await ctx.validator.assertValid('fileId', fileId, 'ObjectId');
//     await ctx.validator.assertValid('ts', timestamp, 'timestamp');

//     if (!(parseInt(timestamp) > Date.now())) {
//         throw new ApplicationError(40306);
//     }

//     const signatureShoulBe = urlSignatureManager.signature({ fileId, timestamp });

//     if (signature !== signatureShoulBe) {
//         throw new ApplicationError(40304);
//     }

//     const fileRecord = await fileMongoOperations.findOne({ _id: new ObjectId(fileId) });
//     if (!fileRecord) {
//         throw new ApplicationError(40402);
//     }

//     const fancyFile = sha256Storage.getFancyFile(fileRecord.sha256SumHex);

//     if (fileRecord.mimeType) {
//         fancyFile.mimeVec = fileRecord.mimeType;
//     }

//     await ctx.returnFancyFile(fancyFile, {
//         fileName: download ? fileRecord.name : undefined
//     });

//     return next();
// }

// export const thumbProfiles = {

//     nhd: [640, 360, '>'],
//     hd: [1280, 720, '>'],
//     fhd: [1920, 1080, '>'],
//     qhd: [2560, 1440, '>'],
//     '4k': [3840, 2160, '>']
// };

// export async function getFileWithImageThumbnailController(
//     ctx: Context &
//         ContextRESTUtils & ParsedContext & SessionWxaFacility & ContextValidator &
//         ContextFileUtils & ContextFileUtils & CrappyKoaRouterThatNeedsReplacement,
//     next: () => Promise<unknown>
// ) {
//     // const currentUser = await ctx.wxaFacl.assertLoggedIn();

//     // const user = await userMongoOperations.getSingleUserById(currentUser.cuid);

//     // if (!user) {

//     //     throw new ApplicationError(40401);
//     // }

//     const fileId = _.get(ctx, 'params.fileId');
//     const timestamp = _.get(ctx, 'query.ts');
//     const signature = _.get(ctx, 'query.sig');
//     const thumbProfile = _.get(ctx, 'query.thumb');
//     const download = _.get(ctx, 'query.download');

//     await ctx.validator.assertValid('fileId', fileId, 'ObjectId');
//     await ctx.validator.assertValid('ts', timestamp, 'timestamp');

//     if (!(parseInt(timestamp) > Date.now())) {

//         throw new ApplicationError(40306);
//     }

//     const signatureShoulBe = urlSignatureManager.signature({ fileId, timestamp });

//     if (signature !== signatureShoulBe) {

//         throw new ApplicationError(40304);
//     }

//     const fileRecord = await fileMongoOperations.findOne({ _id: new ObjectId(fileId) });
//     if (!fileRecord) {

//         throw new ApplicationError(40402);
//     }

//     let resultFile;

//     if (thumbProfile) {
//         const profile = (thumbProfiles as any)[thumbProfile] || thumbProfiles.nhd;

//         const targetFileName = `thumb-${thumbHashManager.hash(profile)}`;

//         if (! await sha256Storage.alreadyStored(fileRecord.sha256SumHex, targetFileName)) {
//             await new Promise((resolve, reject) => {
//                 gm(sha256Storage.fullPath(fileRecord.sha256SumHex, sha256Storage.defaultFileName))
//                     .resize(profile[0], profile[1], profile[2])
//                     .write(sha256Storage.fullPath(fileRecord.sha256SumHex, targetFileName), (err) => {
//                         if (err) {
//                             return reject(err);
//                         }

//                         return resolve();
//                     });
//             });
//         }

//         resultFile = sha256Storage.getFancyFile(fileRecord.sha256SumHex, targetFileName);
//     } else {
//         resultFile = sha256Storage.getFancyFile(fileRecord.sha256SumHex);
//     }

//     if (fileRecord.mimeType) {
//         resultFile.mimeVec = fileRecord.mimeType;
//     }

//     await ctx.returnFancyFile(resultFile, {
//         fileName: download ? fileRecord.name : undefined
//     });

//     return next();
// }
