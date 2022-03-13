import _ from 'lodash';
import { Context } from 'koa';
import Busboy from 'busboy';

import {
    DataStreamBrokenError, FancyFile, Defer,
    TimeoutError, parseContentType, MIMEVec
} from '@naiverlabs/tskit';

import tempFileManager from '../../services/temp';
import globalLogger from '../../services/logger';

export type ParsedContext = Context & {
    request: { body: { [key: string]: any; }; };
    files: UploadedFile[];
};

export type UploadedFile = FancyFile & {
    field?: string;
    claimedName?: string;
    claimedContentType?: MIMEVec | null;
    claimedMime?: string;
};

// globalLogger is an async service. so it needs to be a Promise.
const bodyParserLoggerPromise = (async () => {
    await globalLogger.serviceReady();
    return globalLogger.child({ service: 'bodyParser' });
})();

export async function multiParse(ctx: Context, next: () => Promise<void>) {
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
        limits: {
            fieldNameSize: 1024,
            fieldSize: 1024 * 1024 * 2,
        },
    });

    const allFiles: UploadedFile[] = [];
    if (!ctx.request.body) {
        ctx.request.body = {
            __files: allFiles,
        };
    }

    ctx.files = allFiles;

    boy.on('field', (fieldName, val, _fieldNameTruncated, _valTruncated, _transferEncoding, mimeType) => {
        const decodedFieldName = decodeURIComponent(fieldName);
        let parsedVal = val;
        if (mimeType.startsWith('application/json')) {
            try {
                parsedVal = JSON.parse(val);
            } catch (_err) {
                // swallow for now
                // logger.warn({ err: err, fieldName, val }, 'Failed to parse JSON');
            }
        }

        if (decodedFieldName.endsWith('[]')) {
            const realFieldName = decodedFieldName.slice(0, decodedFieldName.length - 2);
            if (Array.isArray(ctx.request.body[realFieldName])) {
                ctx.request.body[realFieldName].push(parsedVal);
            } else {
                ctx.request.body[realFieldName] = [parsedVal];
            }
        } else {
            ctx.request.body[decodedFieldName] = parsedVal;
        }
    });

    boy.on('file', (fieldName, fileStream, fileName, _transferEncoding, mimeType) => {
        const file: UploadedFile = tempFileManager.cacheReadable(fileStream as any, fileName);
        const decodedFieldName = decodeURIComponent(fieldName);
        file.field = decodedFieldName;
        file.claimedName = fileName;
        file.claimedMime = mimeType;
        file.claimedContentType = parseContentType(mimeType);

        if (decodedFieldName.endsWith('[]')) {
            const realFieldName = decodedFieldName.slice(0, decodedFieldName.length - 2);
            if (Array.isArray(ctx.request.body[realFieldName])) {
                ctx.request.body[realFieldName].push(file);
            } else {
                ctx.request.body[realFieldName] = [file];
            }
        } else {
            ctx.request.body[decodedFieldName] = file;
        }
        allFiles.push(file);
    });

    const deferred = Defer();
    const deletionOfFiles = () => {
        return Promise.all(allFiles.map((x) => x.unlink()));
    };
    boy.once('finish', () => {
        deferred.resolve(allFiles);
    });

    boy.once('error', (err: Error) => {
        deletionOfFiles().catch(logger.warn);
        deferred.reject(new DataStreamBrokenError(err));
    });

    ctx.req.pipe(boy);

    await deferred.promise;

    try {
        return await next();
    } finally {
        if (ctx.res.writable) {
            ctx.res.once('close', () => {
                deletionOfFiles().catch(logger.warn);
            });
        } else {
            deletionOfFiles().catch(logger.warn);
        }
    }
}

const RECEIVE_TIMEOUT = 5 * 60 * 1000;

export async function binaryParse(ctx: Context, next: () => Promise<void>) {
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
            ctx.req.destroy(new TimeoutError(`Unbounded request timedout after ${RECEIVE_TIMEOUT} ms`));
        }, RECEIVE_TIMEOUT);

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
        return await next();
    } finally {
        cachedFile.unlink().catch(logger.warn);
    }
}
