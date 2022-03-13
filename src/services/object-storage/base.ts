import * as minio from 'minio';
import _ from 'lodash';
import { AsyncService, FancyFile } from '@naiverlabs/tskit';

import globalLogger from '../logger';

export interface ObjectStorageOptions extends minio.ClientOptions {
    bucket: string;
    region?: minio.Region;
}

export abstract class AbstractObjectStorageService extends AsyncService {
    logger = globalLogger.child({ service: this.constructor.name });

    minioClient!: minio.Client;

    abstract options: ObjectStorageOptions;

    serialOpBatchSize: number = 10;

    override async init() {
        const options = {
            region: 'us-east-1',
            ...this.options as any
        };

        if (!options.bucket) {
            throw new Error('No bucket specified');
        }

        Object.assign(this.options, options);

        this.minioClient = new minio.Client(_.omit(this.options, 'bucket'));

        const r = await this.minioClient.bucketExists(this.bucket);

        if (!r) {
            this.logger.warn(
                'Object storage bucket did not exist, creating...',
                { bucket: this.bucket, region: this.region }
            );
            await this.minioClient.makeBucket(this.bucket, this.region!);
            this.logger.info(
                'Object storage bucket successfully created.',
                { bucket: this.bucket, region: this.region }
            );
        }
    }

    get bucket() {
        return this.options.bucket;
    }

    get region() {
        return this.options.region;
    }

    async putSingleFile(inputFileHandle: string | FancyFile, objectName: string, meta: minio.ItemBucketMetadata = {}) {

        const file = typeof inputFileHandle === 'string' ? FancyFile.auto(inputFileHandle) : inputFileHandle;

        const r = await this.minioClient.fPutObject(this.bucket, objectName, await file.filePath, meta);

        return { ...r, objectName, bucket: this.bucket, region: this.region, sha256Sum: await file.sha256Sum };
    }

    async removeSingleFile(objectName: string) {
        this.logger.debug('Removing single file', {
            bucket: this.bucket, objectName, region: this.region,
        });

        try {
            return await this.minioClient.removeObject(this.bucket, objectName);
        } catch (err) {
            this.logger.warn('Error removing single file from object storage', {
                bucket: this.bucket, objectName, region: this.region, err,
            });

            throw err;
        }
    }

    async removeMultipleFiles(objectNames: string[]) {
        this.logger.debug('Removing multiple files', {
            bucket: this.bucket, objectNames, region: this.region,
        });

        try {
            return await this.minioClient.removeObjects(this.bucket, objectNames);
        } catch (err) {
            this.logger.warn('Error removing multiple files from object storage', {
                bucket: this.bucket, objectNames, region: this.region, err,
            });

            throw err;
        }
    }

    async purgeByNamePrefix(objectNamePrefix: string, recursive: boolean = true, startAfter?: string) {
        const metaStream = this.minioClient.listObjectsV2(this.bucket, objectNamePrefix, recursive, startAfter);
        const objBuff: minio.BucketItem[] = [];

        let batchCounter = 0;
        let totalCounter = 0;

        const batchRemove = async (objectNames: string[]) => {
            const safeObjectNames = objectNames.filter(Boolean);
            if (!safeObjectNames.length) {
                return;
            }

            batchCounter += 1;
            this.logger.info('Purging name prefix from object storage...', {
                batch: batchCounter,
                batchSize: safeObjectNames.length,
                total: totalCounter,
                bucket: this.bucket,
                region: this.region,
                objectNames: safeObjectNames
            });
            try {
                await this.removeMultipleFiles(safeObjectNames);
            } catch (err) {
                this.logger.warn('Error while purging files by prefix in batch', {
                    bucket: this.bucket, objectNames: safeObjectNames, region: this.region, err,
                });
            }
        };

        return new Promise<void>((resolve, reject) => {
            let lastPromise: Promise<any> = Promise.resolve();

            metaStream.on('data', (meta) => {
                objBuff.push(meta);
                totalCounter += 1;

                if (objBuff.length >= this.serialOpBatchSize) {
                    metaStream.pause();
                    lastPromise = batchRemove(objBuff.map((x) => x.name)).finally(() => {
                        metaStream.resume();
                    });
                    objBuff.length = 0;
                }
            });

            metaStream.on('end', () => {
                if (objBuff.length) {
                    lastPromise = batchRemove(objBuff.map((x) => x.name));
                    objBuff.length = 0;
                }

                lastPromise.then(() => this.logger.info('Batch purge completed', {
                    batch: batchCounter,
                    total: totalCounter,
                    bucket: this.bucket,
                    region: this.region,
                    prefix: objectNamePrefix
                }));

                resolve(lastPromise);
            });

            metaStream.on('error', (err) => {
                reject(err);
            });
        });

    }

    getSingleFile(objName: string, destPath: string) {

        return this.minioClient.fGetObject(this.bucket, objName, destPath);
    }

    signDownloadObject(
        objName: string,
        expirySeconds: number = 1200,
        respHeaders: { [k: string]: string | number | undefined; } = {}
    ) {
        return this.minioClient.presignedGetObject(this.bucket, objName, expirySeconds, respHeaders);
    }
}
