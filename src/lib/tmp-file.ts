import { v1 as UUIDv1 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import * as fse from 'fs-extra';
import { FancyFile } from './fancy-file';

export class TemporaryFileManger {
    protected rootDir: string;

    constructor(rootDir?: string) {
        if (rootDir) {
            try {
                const fstat = fs.statSync(rootDir);
                if (!fstat.isDirectory) {
                    throw new Error('TmpFile targert dir was not a dir: ' + rootDir);
                }
            } catch (err: any) {
                if (err.code === 'ENOENT') {
                    fs.mkdirSync(rootDir);
                    this.rootDir = rootDir;
                    
                    return;
                }
                throw new Error('Error stating tmpfile target dir: ' + rootDir);
            }
            this.rootDir = rootDir;
        } else {
            this.rootDir = fs.mkdtempSync('nodejs-application-');
        }
    }

    fullPath(fileName?: string) {
        return path.join(this.rootDir, fileName || this.newName());
    }

    newName() {
        return UUIDv1();
    }

    touch(): [string, Promise<number>] {
        const newFileName = this.newName();

        return [newFileName, this.touchWithFileName(newFileName)];
    }

    touchWithFileName(fileName: string): Promise<number> {
        return new Promise((resolve, reject) => {
            fs.open(path.join(this.rootDir, fileName), 'w+', (err, fd) => {
                if (err) {
                    return reject(err);
                }
                resolve(fd);
            });
        });
    }

    alloc() {
        return this.fullPath();
    }

    async newWritableStream(fileName?: string): Promise<[string, fs.WriteStream, string]> {
        let fd: number;
        let _fileName: string | undefined = fileName;

        if (_fileName) {
            fd = await this.touchWithFileName(_fileName);
        } else {
            let fdPromise: Promise<number>;
            [_fileName, fdPromise] = this.touch();
            fd = await fdPromise;
        }
        const fpath = path.join(this.rootDir, _fileName);

        return [_fileName, fs.createWriteStream(fpath, { fd, flags: 'w' }), fpath];
    }

    getReadableStream(fileName: string) {
        return fs.createReadStream(path.join(this.rootDir, fileName));
    }

    remove(fileName: string) {
        return new Promise<void>((resolve, reject) => {
            fs.unlink(path.join(this.rootDir, fileName), (err) => {
                if (err) {
                    return reject(err);
                }

                return resolve();
            });
        });
    }

    cacheReadable(readable: Readable, fileName?: string) {
        const tmpFilePath = this.fullPath();

        return FancyFile.auto(readable, tmpFilePath, { fileName });
    }

    cacheBuffer(buff: Buffer, fileName?: string) {
        const tmpFilePath = this.fullPath();

        return FancyFile.auto(buff, tmpFilePath, { fileName });
    }

    cacheText(str: string, fileName?: string) {
        return this.cacheBuffer(Buffer.from(str), fileName);
    }

    access(fileName: string) {
        return FancyFile.auto(this.fullPath(fileName));
    }

    mkdir(dirName: string) {
        const fullPath = path.join(this.rootDir, dirName);

        return new Promise<string>((resolve, reject) => {
            fs.mkdir(fullPath, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve(fullPath);
            });
        });
    }

    touchDir(): [string, Promise<string>] {
        const newName = this.newName();

        return [newName, this.mkdir(newName)];
    }

    rmdir(dirName: string) {
        if (path.isAbsolute(dirName)) {
            return fse.remove(dirName);
        } else {
            return fse.remove(path.join(this.rootDir, dirName));
        }
    }


}
