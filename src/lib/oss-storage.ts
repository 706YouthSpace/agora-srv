import { Readable } from 'stream';

import { join as dirJoin } from 'path';

import { FancyFile } from './fancy-file';

import * as fs from 'fs';
import { randomBytes } from 'crypto';

import AliOss from 'ali-oss';
import { restoreContentType } from './mime';

const RANDOM_BYTE_LENGTH = 24;
const DEFAULT_FILE_NAME = 'DEFAULT';

// tslint:disable:no-magic-numbers
function pathScatter(dirName: string) {
    const l1 = dirName.slice(0, 2);
    const l2 = dirName.slice(2, 4);
    const l3 = dirName.slice(4);

    return dirJoin(l1, l2, l3);
}

export class AliOssStorageManager {
    ossClient: AliOss;
    dirGrid: Map<string, boolean> = new Map();
    defaultFileName: string = DEFAULT_FILE_NAME;
    constructor(ossOptions: AliOss.Options) {
        this.ossClient = new AliOss(ossOptions);
    }

    _statOf(fpath: string): Promise<AliOss.HeadObjectResult> {
        return this.ossClient.head(fpath);
    }


    async alreadyStored(pathName: string, fileName = this.defaultFileName) {
        const targetPath = this.fullPath(pathName, fileName);
        // let fStat;
        try {
            await this._statOf(targetPath);
        } catch (err) {
            return false;
        }
        // if (!fStat || !fStat.isFile()) {
        //     return false;
        // }
        // if (fStat.size === size) {
        //     return true;
        // }
        // let curSha256Sum = await sha256Hasher.hashStream(fs.createReadStream(targetPath));
        // if (curSha256Sum === sha256Sum) {
        //     return true;
        // }
        // return false;

        return true;
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
        const targetPath = this.fullPath(targetDir, targetName);

        return this.ossClient.putStream(targetPath, theStream, {
            meta: {
                sha256Sum: await file.sha256Sum
            },
            contentLength: await file.size,
            mime: restoreContentType(await file.mimeVec as any)
        } as any);
    }


    storeLocalFile(filePath: string, dirName?: string, fileName?: string) {
        const fFile = FancyFile.auto(filePath);

        return this.storeFancyFile(fFile, dirName, fileName);
    }

    fullPath(dirName: string, fileName?: string) {
        if (dirName.indexOf('..') >= 0 || (fileName && fileName.indexOf('..') >= 0)) {
            throw new Error('Illegal path names.');
        }

        const scatteredPath = pathScatter(dirName);

        if (fileName) {
            return dirJoin('/', scatteredPath, fileName);
        }

        return dirJoin('/', scatteredPath);
    }

    async randomName() {
        const randomBuff = await randomBytes(RANDOM_BYTE_LENGTH);

        return randomBuff.toString('hex');
    }

    async getStream(dirName: string, fileName: string = this.defaultFileName): Promise<fs.ReadStream> {
        const fPath = this.fullPath(dirName, fileName);

        const r = await this.ossClient.getStream(fPath);

        return r.stream;
    }

}
