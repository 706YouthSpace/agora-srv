// tslint:disable:max-file-line-count
// tslint:disable:no-floating-promises

import { Readable } from 'stream';
import { open, write, stat, Stats, close, unlink, createReadStream, createWriteStream } from 'fs';
import { basename, extname } from 'path';

import { Defer, Deferred } from './defer';
import { HashManager } from '@naiverlabs/tskit';
import { mimeOf, MIMEVec, parseContentType } from './mime';

// tslint:disable-next-line:no-magic-numbers
const PEEK_BUFFER_SIZE = 32 * 1024;

const sha256Hasher = new HashManager('sha256', 'hex');

export interface PartialFile {
    filePath?: string;
    fileStream?: string;
    fileBuffer?: Buffer | ArrayBuffer;
    sha256Sum?: string;
    mimeType?: string;
    mimeVec?: MIMEVec;
    size?: number;
    fileName?: string;
}

export class ResolvedFile {
    mimeType!: string;
    mimeVec!: MIMEVec;
    fileName!: string;
    size!: number;
    sha256Sum?: string;
    filePath!: string;

    createReadStream() {
        const fpath = this.filePath;

        return createReadStream(fpath);
    }

    async unlink() {
        const fpath = this.filePath;

        return new Promise<unknown>((resolve, reject) => {
            unlink(fpath, (err) => {
                if (err) {
                    return reject(err);
                }

                return resolve(err);
            });
        });
    }
}

export interface HashedFile extends ResolvedFile {
    sha256Sum: string;
}

// const fileUnlinkedPromise = new Promise((resolve, reject) => {
//     reject(new Error('File already UNLINKED explicitly.'));
// });
// fileUnlinkedPromise.catch(() => undefined);

export class FancyFile {
    protected static _keys = ['mimeType', 'mimeVec', 'fileName', 'filePath', 'sha256Sum', 'size'];
    protected static _fromLocalFile(filePath: string, partialFile: PartialFile = {}) {
        if (!(filePath && typeof filePath === 'string')) {
            throw new Error('Auto fancy file requires a file path string.');
        }
        const fileInstance = new this();
        fileInstance._notSupposedToUnlink = true;
        stat(filePath, (err, fstat) => {
            if (err) {
                return fileInstance._rejectAll(err);
            }
            fileInstance.fstat = fstat;
            fileInstance.size = partialFile.size || fstat.size;
            fileInstance.fileName = partialFile.fileName || (basename(filePath) + extname(filePath));
            fileInstance.filePath = filePath;
        });
        if (partialFile.sha256Sum) {
            fileInstance.sha256Sum = partialFile.sha256Sum;
        }
        if (partialFile.mimeVec) {
            fileInstance.mimeVec = partialFile.mimeVec;
        } else if (partialFile.mimeType) {
            fileInstance.mimeVec = parseContentType(partialFile.mimeType);
        }

        return fileInstance;
    }

    protected static _fromStream(readable: Readable, tmpFilePath: string, partialFile: PartialFile = {}) {
        if (!(readable && typeof readable.pipe === 'function' && typeof readable.on === 'function')) {
            throw new Error('Auto fancy file from stream requires a file stream.');
        }
        const tmpTargetStream = createWriteStream(tmpFilePath);
        const fileInstance = new this();
        const peekBuffers: Buffer[] = [];
        let sizeAcc = 0;
        readable.pause();
        fileInstance.fileName = partialFile.fileName || (basename(tmpFilePath) + extname(tmpFilePath));
        if (partialFile.mimeVec) {
            fileInstance.mimeVec = partialFile.mimeVec;
        } else if (partialFile.mimeType) {
            fileInstance.mimeVec = parseContentType(partialFile.mimeType);
        } else {
            readable.once('__peek', () => {
                mimeOf(Buffer.concat(peekBuffers)).then((mimeVec) => {
                    fileInstance.mimeVec = mimeVec;
                }).catch((err) => {
                    fileInstance._rejectAll(err, ['mimeType', 'mimeVec']);
                });
            });
            const peekDataListener = (data: Buffer) => {
                peekBuffers.push(data);
                if (sizeAcc >= PEEK_BUFFER_SIZE) {
                    readable.removeListener('data', peekDataListener);
                    readable.emit('__peek');
                }
            };
            readable.on('data', peekDataListener);
        }
        readable.on('data', (data: Buffer) => {
            sizeAcc += data.byteLength;
        });
        readable.once('end', () => {
            readable.emit('__peek');
            if (!partialFile.size) {
                fileInstance.size = sizeAcc;
            }
        });
        if (partialFile.size) {
            fileInstance.size = partialFile.size;
        }
        fileInstance.sha256Sum = partialFile.sha256Sum || sha256Hasher.hashStream(readable) as Promise<string>;
        readable.on('error', (err: any) => fileInstance._rejectAll(err));
        tmpTargetStream.on('error', (err: any) => fileInstance._rejectAll(err));
        readable.pipe(tmpTargetStream);
        tmpTargetStream.once('finish', () => {
            fileInstance.filePath = tmpFilePath;
        });
        readable.resume();

        return fileInstance;
    }

    protected static _fromBuffer(buff: Buffer, tmpFilePath: string, partialFile: PartialFile = {}) {
        if (!buff || !((buff instanceof Buffer))) {
            throw new Error('Memory fancy file requires a buffer.');
        }
        const fileInstance = new this();
        if (partialFile.mimeVec) {
            fileInstance.mimeVec = partialFile.mimeVec;
        } else if (partialFile.mimeType) {
            fileInstance.mimeVec = parseContentType(partialFile.mimeType);
        } else {
            mimeOf(buff.slice(0, PEEK_BUFFER_SIZE)).then((mimeVec) => {
                fileInstance.mimeVec = mimeVec;
            }).catch((err) => {
                fileInstance._rejectAll(err, ['mimeType', 'mimeVec']);
            });
        }
        fileInstance.size = partialFile.size || buff.byteLength;
        fileInstance.fileName = partialFile.fileName || (basename(tmpFilePath) + extname(tmpFilePath));
        fileInstance.sha256Sum = partialFile.sha256Sum || sha256Hasher.hash(buff) as string;
        fileInstance.filePath = new Promise((resolve, reject) => {
            open(tmpFilePath, 'w', (err, fd) => {
                if (err) {
                    return reject(err);
                }
                write(fd, buff, (err2, _writen) => {
                    if (err2) {
                        return reject(err);
                    }
                    close(fd, (err3) => {
                        if (err3) {
                            return reject(err);
                        }
                        resolve(tmpFilePath);
                    });
                });
            });
        });

        return fileInstance;
    }

    static auto(filePath: string, partialFile?: PartialFile): FancyFile;
    static auto(readable: Readable | Buffer | string, tmpFilePath: string, partialFile?: PartialFile): FancyFile;
    static auto(partialFile: PartialFile, tmpFilePath?: string): FancyFile;
    static auto(a: any, b?: any, c?: any) {
        if (!a) {
            throw new Error('Unreconized Input. No Idea What To Do.');
        }
        if (typeof a === 'string') {
            return this._fromLocalFile(a, b);
        } else if (a.filePath) {
            return this._fromLocalFile(a.filePath, a);
        } else if (a instanceof Buffer) {
            return this._fromBuffer(a, b, c);
        } else if (a.fileBuffer) {
            return this._fromBuffer(a.fileBuffer, b, a);
        } else if (typeof a.pipe === 'function') {
            return this._fromStream(a, b, c);
        } else if (a.fileStream) {
            return this._fromStream(a.fileStream, b, a);
        }

        throw new Error('Unreconized Input. No Idea What To Do.');
    }

    fstat?: Stats;

    protected _notSupposedToUnlink = false;
    protected _deferreds: Map<string, Deferred<any>> = new Map();
    protected _all?: Promise<ResolvedFile>;

    protected _ensureDeferred(key: string) {
        if (!this._deferreds.get(key)) {
            const val = Defer<any>();
            this._deferreds.set(key, val);

            const subval = Object.create(val);
            subval.isNew = true;

            return subval;
        }

        return this._deferreds.get(key)!;
    }
    protected _resolveDeferred(key: string, value: any) {
        const deferred = this._ensureDeferred(key);
        deferred.resolve(value);

        return deferred.promise;
    }
    protected _rejectDeferred(key: string, err: Error) {
        const deferred = this._ensureDeferred(key);

        deferred.promise.catch(() => 0);
        deferred.reject(err);

        return deferred.promise;
    }
    protected _rejectAll(err: Error, keys = FancyFile._keys) {
        for (const x of keys) {
            this._rejectDeferred(x, err);
        }
    }

    get mimeType() {
        const deferred = this._ensureDeferred('mimeType');
        if (deferred.isNew) {
            (this.filePath as any).then(mimeOf).then((mimeVec: any) => {
                this.mimeVec = mimeVec;
            }).catch((err: any) => {
                this._rejectAll(err, ['mimeVec', 'mimeType']);
            });
        }

        return deferred.promise;
    }

    get mimeVec() {
        const deferred = this._ensureDeferred('mimeVec');
        if (deferred.isNew) {
            (this.filePath as any).then(mimeOf).then((mimeVec: any) => {
                this.mimeVec = mimeVec;
            }).catch((err: any) => {
                this._rejectAll(err, ['mimeVec', 'mimeType']);
            });
        }

        return deferred.promise;
    }

    set mimeVec(_mimeVec: string | MIMEVec | null | Promise<MIMEVec | null>) {
        let mimeVec = _mimeVec;
        if (typeof _mimeVec === 'string') {
            mimeVec = parseContentType(_mimeVec);
        }
        const r = this._resolveDeferred('mimeVec', mimeVec);
        // tslint:disable-next-line:no-shadowed-variable
        r.then((mimeVec: MIMEVec) => {
            if (mimeVec) {
                this._resolveDeferred(
                    'mimeType',
                    `${mimeVec.mediaType || 'application'}/${mimeVec.subType || 'octet-stream'}${mimeVec.suffix ? '+' + mimeVec.suffix : ''}`
                );
            } else {
                this._resolveDeferred('mimeType', 'application/octet-stream');
            }
        });

    }

    get fileName() {
        return this._ensureDeferred('fileName').promise;
    }

    set fileName(fileNameText: string | Promise<string>) {
        this._resolveDeferred('fileName', fileNameText);
    }

    get size() {
        return this._ensureDeferred('size').promise;
    }

    set size(sizeNumber: number | Promise<number>) {
        this._resolveDeferred('size', sizeNumber);
    }

    get sha256Sum() {
        const deferred = this._ensureDeferred('sha256Sum');
        if (deferred.isNew) {
            (this.filePath as any)
                .then(createReadStream)
                .then((x: Readable) => sha256Hasher.hashStream(x))
                .then((x: string) => this.sha256Sum = x)
                .catch((err: any) => {
                    this._rejectDeferred('sha256Sum', err);
                });
        }

        return deferred.promise;
    }

    set sha256Sum(sha256SumText: string | Promise<string>) {
        this._resolveDeferred('sha256Sum', sha256SumText);
    }

    get filePath() {
        return this._ensureDeferred('filePath').promise;
    }

    set filePath(filePathText: string | Promise<string>) {
        this._resolveDeferred('filePath', filePathText);
    }

    get all() {
        return this.resolve();
    }

    get ready() {
        return this.filePath;
    }

    resolve() {
        if (!this._all) {
            this._all = Promise.all([
                this.mimeType, this.mimeVec,
                this.fileName, this.size, this.sha256Sum, this.filePath])
                .then((vec: any) => {
                    const [mimeType, mimeVec, fileName, size, sha256Sum, filePath] = vec;
                    const resolvedFile = new ResolvedFile();
                    Object.assign(resolvedFile, { mimeType, mimeVec, fileName, size, sha256Sum, filePath });

                    return resolvedFile;
                }) as Promise<ResolvedFile>;
        }

        return this._all;
    }

    // TODO: Conflict method name of fs.
    async createReadStream(options?: any) {
        const fpath = await this.filePath;

        return createReadStream(fpath, options);
    }

    async unlink(forced = false) {
        if (this._notSupposedToUnlink && !forced) {
            return Promise.resolve();
        }
        const fpath = await this.filePath;

        return new Promise<void>((resolve, reject) => {
            unlink(fpath, (err) => {
                if (err) {
                    return reject(err);
                }
                // this._deferreds.get('filePath')!.promise = fileUnlinkedPromise;

                return resolve();
            });
        });
    }

}
