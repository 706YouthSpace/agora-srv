
import { SharedStateManager } from '../lib/shared-state';
import { primaryRedisClient, redisFactory } from '../db/client/redis';


export const sharedState = new SharedStateManager(primaryRedisClient, redisFactory(), 'x706SharedState');
