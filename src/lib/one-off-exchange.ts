import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';

const ONE_OFF_EXCHANGE_KEY_PREFIX = 'x706-ooe-';

// tslint:disable-next-line: no-magic-numbers
const TWO_HOUR_IN_MILLISECONDS = 2 * 60 * 60 * 1000;

/**
 * Redis operations for one off exchange.
 *
 * @export
 */
export class OneOffExchange {

    protected dbClient: Redis;
    protected dbPrefix = ONE_OFF_EXCHANGE_KEY_PREFIX;

    defaultTTL: number = TWO_HOUR_IN_MILLISECONDS;

    /**
     * Creates an instance of OneOffExchangeService.
     */
    constructor(dbClient: Redis, defaultTTL?: number) {
        this.dbClient = dbClient;

        if (defaultTTL) {
            this.defaultTTL = defaultTTL;
        }

    }

    protected _exchangeIdOf(handle: string) {
        return `${this.dbPrefix}${handle}`;
    }

    deposit(data: any, ttl?: number) {
        const exchangeId = uuidv4();

        return this.depositWithHandle(exchangeId, data, ttl);
    }

    async depositWithHandle(handle: string, data: any, ttl?: number) {
        const ttlToSet = ttl || this.defaultTTL;
        const exchangeId = handle;
        const redisKey = this._exchangeIdOf(exchangeId);
        await this.dbClient.psetex(redisKey, ttlToSet, JSON.stringify(data));

        return handle;
    }


    async retrieve(handle: string, del?: boolean) {
        if (!handle) {
            throw new TypeError('Handle must be a valid string when retrieving an one off exchange.');
        }

        const redisKey = this._exchangeIdOf(handle);

        const stringData = await this.dbClient.get(redisKey);

        if (!stringData) {
            return null;
        }

        if (del) {
            await this.dbClient.del(redisKey);
        }

        try {
            return JSON.parse(stringData);
        } catch (err) {
            return null;
        }
    }

    async rename(oldName: string, newName: string) {

        await this.dbClient.rename(this._exchangeIdOf(oldName), this._exchangeIdOf(newName));

        return newName;
    }

}
