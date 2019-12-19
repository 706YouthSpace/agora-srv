
import { primaryRedisClient } from '../db/client/redis';
import { OneOffExchange } from '../lib/one-off-exchange';


export const oneOffExchangeService = new OneOffExchange(primaryRedisClient);
