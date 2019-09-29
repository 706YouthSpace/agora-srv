
// tslint:disable: no-dynamic-delete

import _ from 'lodash';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

const SESSION_KEY_PREFIX = 'fishy-session-';

const SESSION_MESSAGE_CHANNEL_SUFFIX = '-chan';
const SESSION_MESSAGE_INBOX_SUFFIX = '-inbox';

const SECOUNDS_IN_ONE_DAY = 86400;

export class SessionService extends EventEmitter {

    protected dbClient: Redis;
    protected dbPrefix = SESSION_KEY_PREFIX;
    protected dbSubscriptionChannel: Redis;

    // TTL in secoounds.
    defaultTTL: number = SECOUNDS_IN_ONE_DAY;

    managedSessions: { [k: string]: number } = {};
    channelToUuidMap: { [k: string]: string } = {};

    constructor(dbClient: Redis, dbSubscriptionChannel: Redis, defaultTTL?: number) {
        super();
        this.dbClient = dbClient;
        this.dbSubscriptionChannel = dbSubscriptionChannel;

        if (defaultTTL) {
            this.defaultTTL = defaultTTL;
        }

        this.dbSubscriptionChannel.on('message', async (channel, messageTxt) => {
            const uuid = this.channelToUuidMap[channel];
            if (!uuid) {
                return;
            }

            if (messageTxt !== 'NEW_MSG') {
                return;
            }
            const inboxKey = this._inboxKeyOf(uuid);

            const msgs = await (this.dbClient as any).rpopall(inboxKey);

            if (Array.isArray(msgs) && msgs.length) {

                for (const msg of msgs) {
                    try {
                        this.emit(`msg-${uuid}`, JSON.parse(msg));
                    } catch (err) {
                        this.emit(`msg-${uuid}`, msg);
                    }
                }
            }

            return;
        });

        this.dbClient.defineCommand('xexpire', {
            numberOfKeys: 1,
            lua: `local origTTL = redis.call("ttl", KEYS[1]);
                local r = -2
                if origTTL == -1 then
                    r = redis.call("expire", KEYS[1], ARGV[2] or ARGV[1])
                elseif ARGV[2] then
                    r = redis.call("expire", ARGV[2])
                end
                return r`
        });

        this.dbClient.defineCommand('rpopall', {
            numberOfKeys: 1,
            lua: `local r = redis.call('lrange', KEYS[1]);
                redis.call('del', KEYS[1]);
                return r`
        });

        this.dbClient.defineCommand('lpushexpire', {
            numberOfKeys: 1,
            lua: `local r = redis.call('lpush', KEYS[1], ARGV[2]);
                redis.call('expire', KEYS[1], ARGV[1]);
                return r`
        });
    }

    protected _sessionKeyOf(uuid: string) {
        return `${this.dbPrefix}${uuid}`;
    }

    protected _channelKeyOf(uuid: string) {
        return `${this.dbPrefix}${uuid}${SESSION_MESSAGE_CHANNEL_SUFFIX}`;
    }

    protected _inboxKeyOf(uuid: string) {
        return `${this.dbPrefix}${uuid}${SESSION_MESSAGE_INBOX_SUFFIX}`;
    }

    async createSesion(uuid: string, data: object = {}, ttl?: number) {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when creating a session.');
        }

        const ttlToSet = ttl || this.defaultTTL;

        // When data is empty, no point to set to db. Just assume session exists.
        if (_.isEmpty(data)) {
            return uuid;
        }

        const dataWithValuesStringified = _(data).map((v: any, k: string) => {
            try {
                if (typeof v === 'number' && !isNaN(v)) {
                    return [k, v];
                }

                return [k, JSON.stringify(v)];
            } catch (err) {
                return [k, v];
            }
        }).fromPairs().value();

        const redisKey = this._sessionKeyOf(uuid);

        return this.dbClient.multi()
            .hmset(redisKey, dataWithValuesStringified)
            .expire(redisKey, ttlToSet)
            .exec().then(() => redisKey);
    }

    async setToSession(uuid: string, data: object, ttl?: number) {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when setting to session.');
        }

        // When data is empty, no point to set to db. Just assume session exists.
        if (_.isEmpty(data)) {
            return uuid;
        }

        const dataWithValuesStringified = _(data).map((v: any, k: string) => {
            if (typeof v === 'number' && !isNaN(v)) {
                return [k, v];
            }

            return [k, JSON.stringify(v)];

        }).fromPairs().value();

        const redisKey = this._sessionKeyOf(uuid);

        const flow = this.dbClient.multi()
            .hmset(redisKey, dataWithValuesStringified);

        (flow as any).xexpire(redisKey, ttl || null, this.defaultTTL);

        return flow.exec();
    }

    async getSession(uuid: string, keys?: string[]): Promise<{ [key: string]: any }> {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when getting a session.');
        }

        const redisKey = this._sessionKeyOf(uuid);

        let result: { [k: string]: any };

        if (!Array.isArray(keys) || !keys.length) {
            result = await this.dbClient.hgetall(redisKey);
        } else {
            result = await this.dbClient.hmget(redisKey, ...keys);
        }

        if (!result || _.isEmpty(result)) {
            return {};
        }

        // Cast from string to original js objects.
        const original = _(result).map((v: any, k: string) => {
            try {
                if (typeof v === 'number') {
                    return [k, v];
                }

                return [k, JSON.parse(v)];
            } catch (err) {
                return [k, v];
            }
        }).fromPairs().value();

        return original;
    }

    async sessionKeyincrBy(uuid: string, key: string, amount: number) {
        if (_.isInteger(amount)) {
            return this.dbClient.hincrby(this._sessionKeyOf(uuid), key, amount);
        }
        
        return this.dbClient.hincrbyfloat(this._sessionKeyOf(uuid), key, amount);
    }

    async expire(uuid: string, ttl: number = 0) {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when expiring a session.');
        }

        const redisKey = this._sessionKeyOf(uuid);

        if (ttl <= 0) {
            return this.dbClient.del(redisKey);
        }

        return this.dbClient.expire(redisKey, ttl);
    }

    async sendMessageTo(uuid: string, msg: any) {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when sending a session message.');
        }

        const msgTxt = JSON.stringify(msg);

        const inboxKey = this._inboxKeyOf(uuid);
        const channelKey = this._channelKeyOf(uuid);

        const r = await (this.dbClient as any).lpushexpire(inboxKey, this.defaultTTL, msgTxt);

        await this.dbClient.publish(channelKey, 'NEW_MSG');

        return r;
    }

    async subscribeMessageOf(uuid: string, func: (uuid: string, msg: any) => void) {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when subscribing to.');
        }
        const channelKey = this._channelKeyOf(uuid);

        this.on(`msg-${uuid}`, func);

        if (!this.managedSessions[uuid] || this.managedSessions[uuid] <= 0) {
            await this.dbSubscriptionChannel.subscribe(channelKey);
            this.managedSessions[uuid] = 1;
            this.channelToUuidMap[channelKey] = uuid;

            return;
        }

        this.managedSessions[uuid] += 1;

        return;
    }

    async unsubscribeMessageOf(uuid: string, listener?: any) {
        if (!uuid) {
            throw new TypeError('UUID must be a valid string when unsubscribe to.');
        }
        const channelKey = this._channelKeyOf(uuid);

        if (!listener) {
            this.removeAllListeners(`msg-${uuid}`);
            await this.dbSubscriptionChannel.unsubscribe(channelKey);
            delete this.managedSessions[uuid];
            delete this.channelToUuidMap[channelKey];

            return;
        }

        this.removeListener(`msg-${uuid}`, listener);
        this.managedSessions[uuid] -= 1;
        if (this.managedSessions[uuid] <= 0) {
            await this.dbSubscriptionChannel.unsubscribe(channelKey);
            delete this.managedSessions[uuid];
            delete this.channelToUuidMap[channelKey];
        }

        return;
    }

}
