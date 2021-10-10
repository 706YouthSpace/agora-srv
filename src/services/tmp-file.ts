import { container, singleton } from 'tsyringe';
import { AbstractTempFileManger } from '@naiverlabs/tskit';
import _ from 'lodash';

import config from '../config';


@singleton()
export class TempFileManager extends AbstractTempFileManger {

    rootDir!: string;

    constructor() {
        super(...arguments);

        this.init()
            .then(() => this.emit('ready'))
            .catch((err) => this.emit('error', err));
    }

    override async init() {

        await this.dependencyReady();

        this.rootDir = _.get(config, 'tmpDir');

        await super.init();

    }
}

const tempFileManager = container.resolve(TempFileManager);

export default tempFileManager;
