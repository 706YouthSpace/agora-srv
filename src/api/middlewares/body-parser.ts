
import _ from 'lodash';
import { Context } from 'koa';
import Busboy from 'busboy';

import { FancyFile, Defer, TimeoutError, parseContentType, MIMEVec, ApplicationError } from '@naiverlabs/tskit';
import tempFileManager from '../../services/tmp-file';
import globalLogger from '../../services/logger';

export class DataStreamBrokenError extends ApplicationError {
    constructor(detail?: any) {
        super(40003, detail);
        this.readableMessage = `DataStreamBroken: ${this.message} ${JSON.stringify(this.detail)}`;
    }
}


export type ParsedContext = Context & {
    request: { body: { [key: string]: any } };
};

export type UploadedFile = FancyFile & {
    field?: string;
    claimedName?: string;
    claimedContentType?: MIMEVec | null;
    claimedMime?: string;
};

export interface ContextFileUtils {
    files: UploadedFile[];
}

// globalLogger is an async service. so it needs to be a Promise.
const bodyParserLoggerPromise = (async () => {
    await globalLogger.serviceReady();
    return globalLogger.child({ service: 'bodyParser' });
})();

export async function multiParse(ctx: ParsedContext & ContextFileUtils, next: () => Promise<void>) {
    if (
        !ctx.request.header['content-type'] ||
        !(ctx.request.header['content-type'].indexOf('multipart/form-data') >= 0)
    ) {
        return next();
    }

    await globalLogger.serviceReady();

    const logger = await bodyParserLoggerPromise;

    const boy = new Busboy({
        headers: ctx.headers,
        limits: { fieldNameSize: 1024, fieldSize: 1024 * 1024 * 2 },
    });
    const allFiles: UploadedFile[] = [];
    if (!ctx.request.body) {
        ctx.request.body = {
            __files: allFiles,
        };
    }

    ctx.files = allFiles;

    boy.on('field', (_fieldName, val, _fieldNameTruncated, _valTruncated, _transferEncoding, _mimeType) => {
        const fieldName = decodeURIComponent(_fieldName);
        if (fieldName.endsWith('[]')) {
            const realFieldName = fieldName.slice(0, fieldName.length - 2);
            if (Array.isArray(ctx.request.body[realFieldName])) {
                ctx.request.body[realFieldName].push(val);
            } else {
                ctx.request.body[realFieldName] = [val];
            }
        } else {
            ctx.request.body[fieldName] = val;
        }
    });

    boy.on('file', (_fieldName, fileStream, fileName, _transferEncoding, mimeType) => {
        const file: UploadedFile = tempFileManager.cacheReadable(fileStream as any, fileName);
        const fieldName = decodeURIComponent(_fieldName);
        file.field = fieldName;
        file.claimedName = fileName;
        file.claimedMime = mimeType;
        file.claimedContentType = parseContentType(mimeType);
        if (fieldName.endsWith('[]')) {
            const realFieldName = fieldName.slice(0, fieldName.length - 2);
            if (Array.isArray(ctx.request.body[realFieldName])) {
                ctx.request.body[realFieldName].push(file);
            } else {
                ctx.request.body[realFieldName] = [file];
            }
        } else {
            ctx.request.body[fieldName] = file;
        }
        allFiles.push(file);
    });

    const deferred = Defer();
    const deleationOfFiles = () => {
        return Promise.all(allFiles.map((x) => x.unlink()));
    };
    boy.once('finish', () => {
        deferred.resolve(allFiles);
    });

    boy.once('error', (err: Error) => {
        deleationOfFiles().catch(logger.warn);
        deferred.reject(new DataStreamBrokenError(err));
    });

    ctx.req.pipe(boy);

    await deferred.promise;

    try {
        await next();

        return;
    } finally {
        deleationOfFiles().catch(logger.warn);
    }
}

const RECIEVE_TIMEOUT = 5 * 60 * 1000;

export async function binaryParse(ctx: ParsedContext & ContextFileUtils, next: () => Promise<void>) {
    if (!_.isEmpty(ctx.request.body)) {
        return next();
    }

    const logger = await bodyParserLoggerPromise;

    let useTimeout = false;
    if (!ctx.request.header['content-length']) {
        useTimeout = true;
    }
    const mimeVec = parseContentType(ctx.request.header['content-type'] || 'application/octet-stream');
    const cachedFile = tempFileManager.cacheReadable(ctx.req) as UploadedFile;
    if (useTimeout) {
        const timer = setTimeout(() => {
            ctx.req.destroy(new TimeoutError(`Unbounded request timedout after ${RECIEVE_TIMEOUT} ms`));
        }, RECIEVE_TIMEOUT);

        ctx.req.once('end', () => clearTimeout(timer));
    }

    if (mimeVec) {
        cachedFile.claimedContentType = mimeVec;
    }

    ctx.request.body = {
        __files: [cachedFile],
        file: cachedFile,
    };

    ctx.files = ctx.request.body.__files;

    try {
        await next();
        cachedFile.unlink().catch(logger.warn);

        return;
    } catch (err) {
        cachedFile.unlink().catch(logger.warn);
        throw err;
    }
}
