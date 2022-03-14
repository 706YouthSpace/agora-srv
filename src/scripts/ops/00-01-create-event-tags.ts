import 'reflect-metadata';
import mongoLiveConfig from '../../db/live-config';

async function main() {
    await mongoLiveConfig.serviceReady();

    mongoLiveConfig.logger.info('Setting up event tags...');

    await mongoLiveConfig.set('predefined:event:tags', {
        data: [
            '科技',
            '教育',
            '线上',
            '哲学',
            '艺术'
        ]
    });

    mongoLiveConfig.logger.info('Done.');
}

main().catch((err) => {
    console.error(err.toString());
    console.error(err.stack);
}).then(() => {
    process.exit(0);
});
