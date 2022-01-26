// tslint:disable: no-magic-numbers

import { app } from './api';

import logger from './services/logger';
import { config } from './config';
import loader from './rpc/loader';
import cronJob  from './api/cronJob';

// import { upgradeToKoa } from './lib/ws-koa';

const LISTEN_PORT = config.server.listenPort || 3000;

// const server = app.listen(LISTEN_PORT);
loader.load().then(() => {

    app.listen(LISTEN_PORT);

    // upgradeToKoa(app, server);

    logger.info(`Public Server listining on TCP port ${LISTEN_PORT}`);

    cronJob.startCronJob() ;
});

process.on('unhandledRejection', (_err) => {
    // console.dir(err, {depth: 5});
    // console.log(err.stack);
});
