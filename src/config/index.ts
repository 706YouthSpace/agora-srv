import { AsyncService } from '@naiverlabs/tskit';
import { singleton } from 'tsyringe';

import dev from './dev';
import prod from './prod';
import local from './local';
import _ from 'lodash';

const envMap: any = {
    dev,
    prod,
    local
};

export const config: any = envMap[process.env.NODE_ENV as any] || local;


@singleton()
export class Config extends AsyncService {
    [k: string]: any;
    constructor() {
        super();

        Object.assign(this, { ...config });
        this.emit('ready', this);
    }

    get(key: string) {
        return _.get(this, key);
    }
}


export default config;
