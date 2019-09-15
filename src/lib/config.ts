
// tslint:disable: no-shadowed-variable
import fs from 'fs';
import path from 'path';
import _ from 'lodash';

import { Defer } from './defer';

function recursiveJsonLoadAsync(dir: string) {
    const data = {};
    const deferred = Defer();
    fs.readdir(dir, (err, files) => {
        if (err) { throw err; }
        const promises: Array<Promise<any>> = [];
        for (const file of files) {
            const realPath = path.join(dir, file);
            promises.push(new Promise((resolve, reject) => {
                fs.stat(realPath, (err, fstat) => {
                    if (err) { throw err; }
                    if (fstat.isDirectory()) {
                        try {
                            return resolve(recursiveJsonLoadAsync(realPath));
                        } catch (err) {
                            return reject(err);
                        }
                    } else if (fstat.isFile() && path.extname(realPath).toLowerCase() === '.json') {
                        fs.readFile(realPath, (err, data) => {
                            if (err) {
                                return reject(err);
                            }
                            try {
                                return resolve(JSON.parse(data.toString('utf-8').trim()));
                            } catch (err) {
                                return reject(err);
                            }
                        });
                    } else if (fstat.isFile() && path.extname(realPath).toLowerCase() === '.js') {
                        try {
                            resolve(require(realPath));
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        resolve(undefined);
                    }
                });
            }));
        }
        Promise.all(promises).then(
            (configs: Object[]) => {
                deferred.resolve(_.merge(data, ...configs));
            },
            (err) => { deferred.reject(err); }
        );
    });

    return deferred.promise;
}

export class AsyncEnvConfig {
    config: Object = {};
    loaded?: Promise<boolean>;
    rootDir: string;
    env?: string;
    constructor(rootDir: string, env: string | undefined = process.env.NODE_ENV) {
        this.rootDir = rootDir;
        this.env = env;
    }

    async load(forced: boolean | string = false) {
        if (this.loaded && !forced) {
            await this.loaded;

            return this.config;
        }
        const loadDeferral = Defer<boolean>();
        if (!this.loaded) {
            this.loaded = loadDeferral.promise;
        }
        try {
            const loadedConfig = await recursiveJsonLoadAsync(path.join(this.rootDir, this.env || ''));
            _.merge(this.config, loadedConfig);
            loadDeferral.resolve(true);
        } catch (err) {
            loadDeferral.reject(err);
            throw err;
        }

        return this.config;
    }

    merge(thatConfig: EnvConfig) {
        this.loaded = this.load('forced').then((_r) => thatConfig.load()).then((r) => {
            _.merge(this.config, r);

            return true;
        });

        return this;
    }

    defaults(thatConfig: EnvConfig) {
        this.loaded = this.load('forced').then((_r) => thatConfig.load()).then((r) => {
            _.defaultsDeep(this.config, r);

            return true;
        });

        return this;
    }
}


function recursiveJsonLoadSync(dir: string) {
    const data: any = {};
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const realPath = path.join(dir, file);
        const fstat = fs.statSync(realPath);
        if (fstat.isDirectory()) {
            _.merge(data, recursiveJsonLoadSync(realPath));
        } else if (fstat.isFile() && path.extname(realPath).toLowerCase() === '.json') {
            const parcialData = fs.readFileSync(realPath);
            _.merge(data, JSON.parse(parcialData.toString('utf-8').trim()));
        } else if (fstat.isFile() && (path.extname(realPath).toLowerCase() === '.js')) {
            const parcialData = require(realPath);
            _.merge(data, parcialData);
        }
    }

    return data;
}

export class EnvConfig {
    config: { [key: string]: any } = {};
    loaded?: boolean;
    rootDir: string;
    env?: string;
    constructor(rootDir: string, env: string | undefined = process.env.NODE_ENV) {
        this.rootDir = rootDir;
        this.env = env;
    }

    load() {
        if (!this.loaded) {
            const loadedConfig = recursiveJsonLoadSync(path.join(this.rootDir, this.env || ''));
            _.merge(this.config, loadedConfig);
            this.loaded = true;
        }

        return this.config;
    }

    merge(thatConfig: EnvConfig) {
        _.merge(this.load(), thatConfig.load());

        return this;
    }

    defaults(thatConfig: EnvConfig) {
        _.defaultsDeep(this.load(), thatConfig.load());

        return this;
    }
}
