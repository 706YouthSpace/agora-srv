import { createHash, createHmac, HexBase64Latin1Encoding } from 'crypto';
import { Readable as ReadableStream } from 'stream';

import nodeObjectHash from 'node-object-hash';

export class HashManager {
    protected algorithm: string = 'sha256';
    protected outputFormat: HexBase64Latin1Encoding | 'buffer' = 'hex';

    constructor(algorithm?: string, outputFormat?: HexBase64Latin1Encoding | 'buffer') {

        if (algorithm) {
            this.algorithm = algorithm;
        }
        if (outputFormat) {
            this.outputFormat = outputFormat;
        }
    }

    hash(target: string | Buffer | ArrayBuffer): string | Buffer;
    hash(target: string | Buffer | ArrayBuffer, outputFormat: HexBase64Latin1Encoding): string;
    hash(target: string | Buffer | ArrayBuffer, outputFormat: undefined | 'buffer'): Buffer;
    hash(target: string | Buffer | ArrayBuffer, outputFormat = this.outputFormat): string | Buffer {
        const hashObj = createHash(this.algorithm);
        hashObj.update(target as Buffer);
        if (outputFormat && outputFormat !== 'buffer') {
            return hashObj.digest(outputFormat);
        } else {
            return hashObj.digest();
        }
    }

    hashStream(target: ReadableStream): Promise<Buffer | string>;
    hashStream(target: ReadableStream, outputFormat: HexBase64Latin1Encoding): Promise<string>;
    hashStream(target: ReadableStream, outputFormat: undefined | 'buffer'): Promise<Buffer>;
    hashStream(target: ReadableStream, outputFormat = this.outputFormat): Promise<string | Buffer> {
        const hashObj = createHash(this.algorithm);

        return new Promise((resolve, reject) => {
            target.on('data', (chunk) => hashObj.update(chunk));
            target.on('end', () => resolve(outputFormat && outputFormat !== 'buffer' ? hashObj.digest(outputFormat) : hashObj.digest()));
            target.on('error', reject);
        });
    }
}

export class HMacManager {
    protected algorithm: string = 'sha256';
    protected outputFormat: HexBase64Latin1Encoding | 'buffer' = 'hex';

    key: string;

    constructor(key: string, algorithm?: string, outputFormat?: HexBase64Latin1Encoding | 'buffer') {
        this.key = key;

        if (algorithm) {
            this.algorithm = algorithm;
        }
        if (outputFormat) {
            this.outputFormat = outputFormat;
        }
    }

    sign(target: string | Buffer | ArrayBuffer): string | Buffer;
    sign(target: string | Buffer | ArrayBuffer, outputFormat: HexBase64Latin1Encoding): string;
    sign(target: string | Buffer | ArrayBuffer, outputFormat: undefined | 'buffer'): Buffer;
    sign(target: string | Buffer | ArrayBuffer, outputFormat = this.outputFormat): string | Buffer {
        const hashObj = createHmac(this.algorithm, this.key);
        hashObj.update(target as Buffer);
        if (outputFormat && outputFormat !== 'buffer') {
            return hashObj.digest(outputFormat);
        } else {
            return hashObj.digest();
        }
    }

    signStream(target: ReadableStream): Promise<Buffer | string>;
    signStream(target: ReadableStream, outputFormat: HexBase64Latin1Encoding): Promise<string>;
    signStream(target: ReadableStream, outputFormat: undefined | 'buffer'): Promise<Buffer>;
    signStream(target: ReadableStream, outputFormat = this.outputFormat): Promise<string | Buffer> {
        const hashObj = createHmac(this.algorithm, this.key);

        return new Promise((resolve, reject) => {
            target.on('data', (chunk) => hashObj.update(chunk));
            target.on('end', () => resolve(outputFormat && outputFormat !== 'buffer' ? hashObj.digest(outputFormat) : hashObj.digest()));
            target.on('error', reject);
        });
    }
}

const COLUMN_INSERTION_FACTOR = 2;

export class SaltedHashManager extends HashManager {
    protected seedHash: Buffer;
    protected seed: string;

    constructor(seed: string, algorithm: string = 'sha256', outputFormat: HexBase64Latin1Encoding | 'buffer' = 'hex') {
        super(algorithm, outputFormat);
        this.seed = seed;
        this.seedHash = super.hash(seed, 'buffer');
    }
    hash(target: string | Buffer | ArrayBuffer): string | Buffer;
    hash(target: string | Buffer | ArrayBuffer, outputFormat: HexBase64Latin1Encoding): string;
    hash(target: string | Buffer | ArrayBuffer, outputFormat: undefined | 'buffer'): Buffer;
    hash(target: string | Buffer | ArrayBuffer, outputFormat = this.outputFormat): string | Buffer {
        const targetHash = super.hash(target, 'buffer');
        const fusionBuffer = Buffer.alloc(targetHash.length + this.seedHash.length);
        this.seedHash.forEach((vlu, idx) => {
            fusionBuffer[COLUMN_INSERTION_FACTOR * idx] = vlu;
        });
        targetHash.forEach((vlu, idx) => {
            fusionBuffer[COLUMN_INSERTION_FACTOR * idx + 1] = vlu;
        });
        if (outputFormat && outputFormat !== 'buffer') {
            return super.hash(fusionBuffer, outputFormat);
        } else {
            return super.hash(fusionBuffer);
        }
    }

    hashStream(target: ReadableStream): Promise<string | Buffer>;
    hashStream(target: ReadableStream, outputFormat: HexBase64Latin1Encoding): Promise<string>;
    hashStream(target: ReadableStream, outputFormat: undefined | 'buffer'): Promise<Buffer>;
    hashStream(target: ReadableStream, outputFormat = this.outputFormat): Promise<string | Buffer> {
        return super.hashStream(target, undefined).then((r) => {
            const targetHash = r;
            const fusionBuffer = Buffer.alloc(targetHash.length + this.seedHash.length);
            this.seedHash.forEach((vlu, idx) => {
                fusionBuffer[COLUMN_INSERTION_FACTOR * idx] = vlu;
            });
            targetHash.forEach((vlu, idx) => {
                fusionBuffer[COLUMN_INSERTION_FACTOR * idx + 1] = vlu;
            });
            if (outputFormat && outputFormat !== 'buffer') {
                return super.hash(fusionBuffer, outputFormat);
            } else {
                return super.hash(fusionBuffer);
            }
        });
    }
}


const objHasher = nodeObjectHash();

export function objHashMd5B64Of(obj: any) {
    return objHasher.hash(obj, { enc: 'base64', alg: 'md5' });
}
