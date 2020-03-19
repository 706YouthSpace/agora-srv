import winston from 'winston';

const CURRENT_LOGGING_LEVEL = 'info';

const winstonLogger = winston.createLogger({
    transports: [
        new winston.transports.Console({ level: CURRENT_LOGGING_LEVEL })
    ]
});


function log(level: string, msg: string | any, ...metas: any[]) {
    const message = typeof msg === 'string' ? msg : (msg.stack ? msg.stack : msg.toString());
    const obj = Object.assign({ message, utcDate: new Date().toUTCString() }, ...metas);
    if (metas) {
        for (const x of metas) {
            if (x && x.stack) {
                obj.stack = x.stack;
            }
        }
    }
    (winstonLogger as any)[level](obj);
}

const logger = {
    info: (msg: string, ...metas: any[]) => {
        log('info', msg, ...metas);
    },
    warn: (msg: string, ...metas: any[]) => {
        log('warn', msg, ...metas);
    },
    debug: (msg: string, ...metas: any[]) => {
        log('debug', msg, ...metas);
    },
    error: (msg: string, ...metas: any[]) => {
        log('error', msg, ...metas);
    }

};

export { logger };
