import Redis from 'ioredis';
import config from '../../config';


export function redisFactory() {

    return new Redis({
        ...config.redis
    });

}


export const primaryRedisClient = redisFactory();
