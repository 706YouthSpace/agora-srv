import { Context } from 'koa';
import { logger } from '../../services/logger';

export interface ContextLogger {
    logger: typeof logger
}

export function injectLoggerMiddleware(ctx: Context, next: () => Promise<any>) {

    (ctx as Context & ContextLogger).logger = logger;

    return next();
}
