import { AbstractStorageManager } from '@naiverlabs/tskit';
import _ from 'lodash';
import { container, singleton } from 'tsyringe';
import config from '../config';

@singleton()
export class StorageManager extends AbstractStorageManager {

    storageRoot: string;

    constructor() {
        super(...arguments);

        this.storageRoot = _.get(config, 'storage.sha256Root');
        this.defaultFileName = 'file';

        this.init()
            .then(() => this.emit('ready'))
            .catch((err) => this.emit('error', err));
    }

    override async init() {

        await this.dependencyReady();

        await super.init();

    }

}

const storageManager = container.resolve(StorageManager);

export default storageManager;