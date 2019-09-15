import mmm from 'mmmagic';
import mime from 'mime';

import _ from 'lodash';

export const CUSTOM_MIME: { [key: string]: string[] } = {

};

mime.define(CUSTOM_MIME);

export function mimeTypeCompatible(thisMimeType: string, thatMimeType: string, sharedExt?: string) {
    if (thisMimeType === thatMimeType) {
        return true;
    }
    const thisExts = (mime as any)._types[thisMimeType];
    const thatExts = (mime as any)._types[thatMimeType];
    const intersection = _.intersection(thisExts, thatExts);
    if (intersection.length === 0) {
        return false;
    }
    if (sharedExt) {
        if (intersection.indexOf(sharedExt) >= 0) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

export function mimeOfExt(ext: string) {
    return mime.getType(ext);
}

export function extOfMime(mimeType: string) {
    return mime.getExtension(mimeType);
}

const magic = new mmm.Magic(mmm.MAGIC_MIME);

export function detectFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        magic.detectFile(path, (err, result) => {
            if (err) {
                return reject(err);
            }

            return resolve(result);
        });
    });
}

export function detectBuff(buff: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
        magic.detect(buff, (err, result) => {
            if (err) {
                return reject(err);
            }

            return resolve(result);
        });
    });
}

export async function mimeOf(data: string | Buffer) {
    let result: string;
    if (typeof data === 'string') {
        result = await detectFile(data);
    } else {
        result = await detectBuff(data);
    }
    const vec = parseContentType(result);
    if (!vec) {
        throw new Error('Unable to detect mime');
    }

    return vec;
}

export interface MIMEVec {
    mediaType: string;
    subType: string;
    suffix?: string;
    attrs?: { [k: string]: string };
}

// tslint:disable-next-line:max-line-length
const CONTENT_TYPE_RE = /^((?:[0-9A-Za-z]+)|\*)\/(\*|(?:\b[0-9A-Za-z\-_]+(?:\-?\b[0-9A-Za-z\-_]+\b)*(?:\.\b[0-9A-Za-z\-_]+\b(?:\-\b[0-9A-Za-z\-_]+\b)*)*))(?:\+?(\b[0-9A-Za-z\-_\.]+\b))?(?:;\s*(.*?))?$/;

export function restoreContentType(mimeVec: MIMEVec) {
    if (!mimeVec) {
        return '';
    }
    let attrsLiteral = '';
    if (mimeVec.attrs) {
        for (const [k, v] of Object.entries(mimeVec.attrs)) {
            attrsLiteral += `; ${k}=${v}`;
        }
    }

    return `${mimeVec.mediaType || 'application'}/${mimeVec.subType || 'octet-stream'}` +
        `${mimeVec.suffix ? '+' + mimeVec.suffix : ''}` +
        `${attrsLiteral}`;
}

export function parseContentType(mimeStr: string): MIMEVec | null {
    const r = CONTENT_TYPE_RE.exec(mimeStr);
    if (!r) {
        return null;
    }
    const [, mediaType, subType, suffix, typeParamText] = r;
    const attrs: { [k: string]: string } = {};
    if (typeParamText) {
        const paramVecs = typeParamText.split(/\s*;\s*/);
        for (const vec of paramVecs) {
            if (!vec) {
                continue;
            }
            const [k, _v] = vec.split(/\s*=\s*/);
            const v = _.trim(_v, '" \t\n');
            if (k && v) {
                attrs[k.toLowerCase()] = v;
            }
        }
    }

    return { mediaType: mediaType.toLowerCase(), subType: subType.toLowerCase(), suffix: suffix ? suffix.toLowerCase() : suffix, attrs };
}
