import { ObjectId } from 'mongodb';
import { singleton } from 'tsyringe';

import { Config } from '../../config';

import { AbstractObjectStorageService, ObjectStorageOptions } from './base';

@singleton()
export class X706ObjectStorage extends AbstractObjectStorageService {

    options!: ObjectStorageOptions;

    constructor(protected config: Config) {
        super(...arguments);

        this.init()
            .catch((err) => this.emit('error', err));
    }

    override async init() {
        await this.dependencyReady();
        const aliyunConf = this.config.get('aliyun');
        this.options = {
            endPoint: aliyunConf.ossEndpint,
            bucket: aliyunConf.ossBucket,
            useSSL: true,
            accessKey: aliyunConf.accessKey,
            secretKey: aliyunConf.accessSecret,
            pathStyle: false,
        }

        await super.init();

        this.emit('ready');
    }

    getResourceUrl(input: string | ObjectId | URL | undefined) {
        if (!input) {
            return undefined;
        }
        if (ObjectId.isValid(input as any)) {
            return this.signDownloadObject(`f/${input}`, 86400);
        }

        return `${input}`;
    }
}
