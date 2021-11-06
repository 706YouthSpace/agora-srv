import { AbstractLogger, LoggerInterface } from '@naiverlabs/tskit';
import { container, singleton } from 'tsyringe';
import { Config } from '../config';

@singleton()
export class Logger extends AbstractLogger {

    logger!: LoggerInterface;

    loggerOptions = {};

    constructor(private config: Config) {
        super(...arguments);

        this.init()
            .then(() => this.emit('ready'))
            .catch((err) => this.emit('error', err));
    }

    override async init() {
        await this.dependencyReady();

        const logStyle = this.config.logStyle || 'text';

        this.loggerOptions = logStyle === 'text' ? {
            prettyPrint: {
                colorize: true
            }
        } : {};

        super.init();
    }

}

const logger = container.resolve(Logger);

export default logger;
