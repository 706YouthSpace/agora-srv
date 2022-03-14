import 'reflect-metadata';
import { dbs } from '../../db';

async function main() {
    
    for (const db of dbs) {
        await db.serviceReady();
        db.logger.info('Setting up collection...');
        await db.ensureCollection();

        db.logger.info('Creating index...');
        await db.createIndexes();
        db.logger.info('Done.');
    }
}

main().catch((err) => {
    console.error(err.toString());
    console.error(err.stack);
}).then(() => {
    process.exit(0);
});
