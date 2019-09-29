import { SessionService } from '../lib/session';
import { primaryRedisClient, redisFactory } from '../db/client/redis';
import { SaltedHashManager } from '../lib/hash';
import config from '../config';


export const sessionService = new SessionService(primaryRedisClient, redisFactory());
export const sessionTokenHasher = new SaltedHashManager(config.seed.sessionHasher, 'sha256', 'buffer');
