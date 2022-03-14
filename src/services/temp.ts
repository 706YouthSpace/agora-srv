import { container, singleton } from 'tsyringe';
import { AbstractTempFileManger } from '@naiverlabs/tskit';

import { Config } from '../config';

@singleton()
export class TempFileManager extends AbstractTempFileManger {

    rootDir!: string;

    constructor(private config: Config) {
        super(...arguments);

        this.init()
            .catch((err) => this.emit('error', err));
    }

    override async init() {

        await this.dependencyReady();

        this.rootDir = this.config.get('tmpDir');

        await super.init();

        this.emit('ready');
    }
}

const tempFileManager = container.resolve(TempFileManager);

export default tempFileManager;
