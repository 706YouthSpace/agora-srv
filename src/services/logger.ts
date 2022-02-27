import { AbstractLogger, LoggerInterface, LoggerOptions } from '@naiverlabs/tskit';
import { container, singleton } from 'tsyringe';
import { Config } from '../config';
import pino from 'pino';
import _ from 'lodash';

@singleton()
export class Logger extends AbstractLogger {
    logger: LoggerInterface;
    loggerOptions: LoggerOptions = {};

    constructor(private config: Config) {
        super(...arguments);

        this.level = 'debug';

        this.logger = pino(this.loggerOptions);

        this.init()
            .catch((err) => this.emit('error', err));
    }

    set level(text: string | undefined) {
        this.loggerOptions.level = text;
    }

    get level() {
        return this.loggerOptions.level;
    }

    override async init() {
        await this.dependencyReady();

        const logStyle = this.config.get('logStyle');
        const debugEnabled = this.config.get('debug');
        if (debugEnabled) {
            this.level = 'debug';
        } else {
            this.level = 'info';
        }

        const patchLogOptions: LoggerOptions = logStyle === 'text' ? {
            prettyPrint: {
                colorize: true,
                messageFormat(log, messageKey) {
                    return `[${log['service'] || 'ROOT'}] ${log[messageKey]}`;
                },
                singleLine: true
            }
        } : {};

        _.merge(this.loggerOptions, patchLogOptions);

        super.init();

        this.emit('ready');
    }

}

const logger = container.resolve(Logger);

export default logger;
