import { Readable, PassThrough } from 'stream';
import { ensureDir, pathExists } from 'fs-extra';

import { join as dirJoin } from 'path';

import { FancyFile, CONTENT_TYPE_XATTR_KEY, SHA256_XATTR_KEY } from './fancy-file';
import { promisify } from 'util';

import * as fs from 'fs';
import { randomBytes } from 'crypto';

import xattr from 'fs-xattr';
import { restoreContentType } from './mime';

const setXattr = promisify(xattr.set);

const fstat = promisify(fs.stat);
const funlink = promisify(fs.unlink);

const RANDOM_BYTE_LENGTH = 24;
const DEFAULT_FILE_NAME = 'DEFAULT';

// tslint:disable:no-magic-numbers
function pathScatter(dirName: string) {
    const l1 = dirName.slice(0, 2);
    const l2 = dirName.slice(2, 4);
    const l3 = dirName.slice(4);

    return dirJoin(l1, l2, l3);
}

export class StorageManager {
    storageRoot: string;
    dirGrid: Map<string, boolean> = new Map();
    defaultFileName: string = DEFAULT_FILE_NAME;
    constructor(storageRoot: string) {
        this.storageRoot = storageRoot;
    }

    _ensureDir(dir: string) {
        if (this.dirGrid.get(dir)) {
            return Promise.resolve();
        }

        return ensureDir(dirJoin(this.storageRoot, dir)).then(() => {
            this.dirGrid.set(dir, true);
        });
    }

    async securePathFor(pathName: string, fileName?: string) {
        await this._ensureDir(pathScatter(pathName));

        return this.fullPath(pathName, fileName);
    }

    _statOf(fpath: string): Promise<fs.Stats> {
        return fstat(fpath);
    }

    async _sizeOf(targetPath: string) {
        const stat = await this._statOf(targetPath);

        return stat.size;
    }

    async alreadyStored(pathName: string, fileName = this.defaultFileName, size?: number) {
        const targetPath = this.fullPath(pathName, fileName);
        let fStat;
        try {
            fStat = await this._statOf(targetPath);
        } catch (err) {
            return false;
        }
        if (!fStat || !fStat.isFile()) {
            return false;
        }
        if (fStat.size === size) {
            return true;
        }
        // let curSha256Sum = await sha256Hasher.hashStream(fs.createReadStream(targetPath));
        // if (curSha256Sum === sha256Sum) {
        //     return true;
        // }
        // return false;

        return true;
    }

    accessLocalFile(dirName: string, fileName: string = this.defaultFileName, overrideFileName?: string) {
        return FancyFile.auto(this.fullPath(dirName, fileName), { fileName: overrideFileName });
    }

    async storeFancyFile(file: FancyFile, dirName?: string, fileName?: string) {
        if (!file) {
            throw new Error('No file to store.');
        }
        let targetDir = dirName;
        let targetName = fileName;
        if (!targetDir) {
            targetDir = await this.randomName();
        }
        if (!targetName) {
            if (! await this.alreadyStored(targetDir, this.defaultFileName)) {
                targetName = this.defaultFileName;
            } else {
                targetName = await this.randomName();
            }
        }

        const theStream: Readable = await file.createReadStream();
        const targetPath = await this.securePathFor(targetDir, targetName);

        const targetPromise = new Promise<[string, string]>((resolve, reject) => {
            const targetStream = fs.createWriteStream(targetPath);
            theStream.once('error', (err) => {
                reject(err);
            });
            targetStream.once('error', (err: Error) => {
                reject(err);
            });
            targetStream.once('finish', () => {
                resolve([targetDir!, targetName!]);
            });
            theStream.pipe(targetStream);
        });
        // tslint:disable-next-line:no-floating-promises
        targetPromise.then(async () => {
            const sha256Sum = await file.sha256Sum;
            await setXattr(targetPath, SHA256_XATTR_KEY, sha256Sum);
        });
        // tslint:disable-next-line:no-floating-promises
        targetPromise.then(async () => {
            const mimeVec = await file.mimeVec;
            if (mimeVec) {
                await setXattr(targetPath, CONTENT_TYPE_XATTR_KEY, restoreContentType(mimeVec));
            }
        });

        return targetPromise;
    }


    async storeReadable(stream: Readable, dirName?: string, fileName?: string) {
        if (!stream) {
            throw new Error('No stream to store.');
        }
        stream.pause();
        let targetDir = dirName;
        let targetName = fileName;
        if (!targetDir) {
            targetDir = await this.randomName();
        }
        if (!targetName) {
            if (!await this.alreadyStored(targetDir, this.defaultFileName)) {
                targetName = this.defaultFileName;
            } else {
                targetName = await this.randomName();
            }
        }
        const targetPath = await this.securePathFor(targetDir, targetName);
        const targetStream = fs.createWriteStream(targetPath);

        const targetPromise = new Promise<[string, string]>((resolve, reject) => {
            stream.once('error', (err) => {
                reject(err);
            });
            stream.once('end', () => {
                resolve([targetDir!, targetName!]);
            });
        });
        stream.pipe(targetStream);
        stream.resume();

        return targetPromise;
    }

    storeLocalFile(filePath: string, dirName?: string, fileName?: string) {
        const fFile = FancyFile.auto(filePath);

        return this.storeFancyFile(fFile, dirName, fileName);
    }

    storeBuffer(buff: Buffer | ArrayBuffer, dirName?: string, fileName?: string) {
        const pStream = new PassThrough();
        const r = this.storeReadable(pStream, dirName, fileName);
        pStream.write(buff);
        pStream.end();

        return r;
    }

    erase(dirName: string, fileName: string) {
        const fpath = this.fullPath(dirName, fileName);

        return funlink(fpath);
    }

    fullPath(dirName: string, fileName?: string) {
        if (dirName.indexOf('..') >= 0 || (fileName && fileName.indexOf('..') >= 0)) {
            throw new Error('Illegal path names.');
        }

        const scatteredPath = pathScatter(dirName);

        if (fileName) {
            return dirJoin(this.storageRoot, scatteredPath, fileName);
        }

        return dirJoin(this.storageRoot, scatteredPath);
    }

    async randomName() {
        const randomBuff = await randomBytes(RANDOM_BYTE_LENGTH);

        return randomBuff.toString('hex');
    }

    getStream(dirName: string, fileName: string = this.defaultFileName, options?: { start: number; end: number }): Promise<fs.ReadStream> {
        const fPath = this.fullPath(dirName, fileName);

        return this.getLocalStream(fPath, options);
    }

    getLocalStream(fpath: string, options?: { start: number; end: number }): Promise<fs.ReadStream> {
        return new Promise((resolve, reject) => {
            pathExists(fpath, (err, exists) => {
                if (exists) {
                    const theStream = fs.createReadStream(fpath, options);

                    return resolve(theStream);
                }
                if (err) {
                    return reject(err);
                }

                return reject(new ReferenceError('No such file'));
            });
        });
    }

    getFancyFile(dirName: string, fileName: string = this.defaultFileName) {
        const fPath = this.fullPath(dirName, fileName);

        return FancyFile.auto(fPath);
    }

}
