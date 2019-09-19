// tslint:disable: no-magic-numbers
import { Redis } from 'ioredis';
import { randomBytes } from './binary';

import { EventEmitter } from 'events';
import Redlock from 'redlock';
import { delay } from './simple-tools';

const L1_REDIS_KEY_PREFIX = 'SS-';

const DEFAULT_TTL = 43200 * 1000;
const RANDOM_BYTES_LENGTH = 16;

const SAFETY_PADDING = 60 * 1000;

export interface ValueChangedEventMessage {
    i: string;  // Id
    k: string;  // Key
    v: any;     // Value
    l?: number; // Locked for ms
    e: number;  // Expires at timestamp in ms
    o?: number; // Explicit offset before expires
}

interface TrackingProfile {
    refreshAt?: number;
    refreshTimer?: NodeJS.Timer;
    instance: SharedState;
    redlock: Redlock;
}

export interface State<T> {
    value: T;
    expiresAt: number;
    offset?: number;
}

export abstract class SharedState<T = any> extends EventEmitter {
    _locked: boolean = true;
    _lockedUntil?: number;
    _value?: T;
    expiresAt: number = Date.now();
    offset?: number;

    constructor() {
        super();
        this.on('unlock', () => {
            this._locked = false;
        });
        this.on('lock', (lockedUntil: number) => {
            this._locked = true;
            if (lockedUntil) {
                this._lockedUntil = lockedUntil;
            }
        });
    }

    abstract next(): State<T> | Promise<State<T> | void> | void;

    get locked() {
        return (this._locked && (this._lockedUntil ? (Date.now() < this._lockedUntil) : true)) || (Date.now() > this.expiresAt);
    }

    set locked(value: boolean) {
        this._locked = value;
    }

    get value() {
        if (this.locked || (Date.now() > this.expiresAt)) {
            return new Promise<T>((resolve, _reject) => {
                this.once('unlock', resolve);
            });
        }

        return this._value;
    }
}

export interface SharedState<T = any> {
    // tslint:disable: unified-signatures
    on(event: 'update', listener: (data: T) => void): this;
    on(event: 'lock', listener: (lockedUntil: number) => void): this;
    on(event: 'unlock', listener: (data: T) => void): this;
    on(event: 'error', listener: (error: any) => void): this;

    discard(): void;
}

export class SharedStateManager extends EventEmitter {
    channel: string;
    mainRedisClient: Redis;
    subscriptionRedisClient: Redis;

    redisKeyPrefix: string;

    redisControlChannelKey: string;

    defaultTimeout: number = DEFAULT_TTL;
    defaultPadding: number = SAFETY_PADDING;

    trackedProfiles: Map<string, TrackingProfile> = new Map();

    constructor(mainRedisClient: Redis, subscriptionRedisClient: Redis, channel: string = 'DEFAULT') {
        super();

        if (!(mainRedisClient && subscriptionRedisClient && channel)) {
            throw new TypeError('Invalid use of SharedStateManager');
        }

        this.mainRedisClient = mainRedisClient;
        this.subscriptionRedisClient = subscriptionRedisClient;
        this.channel = channel;

        this.redisKeyPrefix = `${L1_REDIS_KEY_PREFIX}-${channel}`;

        this.redisControlChannelKey = `${L1_REDIS_KEY_PREFIX}-${channel}-CONTROL`;

        this._subscribeToChannel();
    }

    protected _channelKeyOf(key: string) {
        return `${this.redisKeyPrefix}-chan-${key}`;
    }

    protected _dataKeyOf(key: string) {
        return `${this.redisKeyPrefix}-data-${key}`;
    }

    protected _lockKeyOf(key: string) {
        return `${this.redisKeyPrefix}-lock-${key}`;
    }

    // protected _stringRedLockKeyOf(key: string) {
    //     return `${this.redisKeyPrefix}redlock-${key}`;
    // }

    protected _getProfile(key: string) {
        let profile = this.trackedProfiles.get(key)!;
        if (!profile) {
            profile = {
            } as any;
            // Ioredis provides `autoResubscribe` feature.
            // All subscriptions were preserved.
            // Must not resubscribe
            this.subscriptionRedisClient.subscribe(this._channelKeyOf(key));
            this.trackedProfiles.set(key, profile!);
        }

        return profile;
    }

    protected discard(key: string) {
        const profile = this.trackedProfiles.get(key);
        if (!profile) {
            return;
        }

        if (profile.refreshTimer) {
            clearTimeout(profile.refreshTimer);
        }

        this.subscriptionRedisClient.unsubscribe(this._channelKeyOf(key));

        this.trackedProfiles.delete(key);

        return profile;
    }

    protected _fetchCurrentState(key: string) {
        const profile = this._getProfile(key);
        this.mainRedisClient.get(this._dataKeyOf(key), (err, res) => {
            if (err) {
                profile.instance.emit('error', err);

                this.discard(key);

                return;
            }
            if (!res) {
                profile.instance.next();

                return;
            }

            let jsData: ValueChangedEventMessage;
            try {
                jsData = JSON.parse(res);
            } catch (err) {
                return;
            }

            profile.instance._value = jsData.v;
            profile.instance.expiresAt = jsData.e;
            if (jsData.o) {
                profile.instance.offset = jsData.o;
            }

            const refreshAt = jsData.e - (jsData.o || this.defaultPadding);
            profile.refreshAt = refreshAt;
            const timeToRefresh = refreshAt - Date.now() - (Math.random() * 0.2 * (jsData.o || this.defaultPadding));
            if (profile.refreshTimer) {
                clearTimeout(profile.refreshTimer);
            }
            profile.refreshTimer = setTimeout(
                () => {
                    profile.instance.next();
                },
                timeToRefresh
            ) as any as NodeJS.Timer;
            profile.refreshTimer.unref();
            profile.instance.emit('unlock', jsData.v);

        });

    }

    protected _subscribeToChannel() {
        this.subscriptionRedisClient.on('message', (channel, messageString) => {
            if (!messageString) {
                return;
            }
            let messageObj: ValueChangedEventMessage;
            try {
                messageObj = JSON.parse(messageString);
            } catch (err) {
                // Invalid JSON string is omited.
                return;
            }
            if (!messageObj.k) {
                return;
            }
            if (!this.trackedProfiles.has(messageObj.k)) {
                this.subscriptionRedisClient.unsubscribe(channel);

                return;
            }

            const profile = this.trackedProfiles.get(messageObj.k)!;

            if (messageObj.hasOwnProperty('v')) {
                profile.instance._value = messageObj.v;
            }

            if (messageObj.o) {
                profile.instance.offset = messageObj.o;
            }

            if (messageObj.e) {
                profile.instance.expiresAt = messageObj.e;
                const refreshAt = profile.instance.expiresAt - (profile.instance.offset || this.defaultPadding);
                profile.refreshAt = refreshAt;
                const timeToRefresh = refreshAt - Date.now() - (Math.random() * 0.2 * (messageObj.o || this.defaultPadding));
                if (profile.refreshTimer) {
                    clearTimeout(profile.refreshTimer);
                }
                profile.refreshTimer = setTimeout(
                    () => {
                        profile.instance.next();
                    },
                    timeToRefresh
                ) as any as NodeJS.Timer;

                profile.refreshTimer.unref();
            }

            if (messageObj.l) {
                profile.instance.emit('lock', messageObj.l);

                return;
            } else if (messageObj.l === 0 && (profile.instance.expiresAt > Date.now())) {

                profile.instance.emit('unlock', profile.instance._value);

                return;
            }

            profile.instance.emit('unlock', profile.instance._value);
            profile.instance.emit('update', profile.instance._value);

        });
    }


    async _setState<T = any>(key: string, state: State<T>) {
        if (!key) {
            return null;
        }

        const timeLeft = state.expiresAt - Date.now();

        const ttlToBeSet = timeLeft > 0 ? parseInt(timeLeft as any, 10) : 0;
        const stringValue = JSON.stringify({
            i: (await randomBytes(RANDOM_BYTES_LENGTH)).toString('base64'),
            k: key,
            v: state.value,
            e: state.expiresAt
        });

        await this.mainRedisClient.multi()
            .setex(this._dataKeyOf(key), ttlToBeSet, stringValue)
            .publish(this._channelKeyOf(key), stringValue)
            .exec();

        return state;
    }

    create<T = any>(stateClass: typeof SharedState, key: string): SharedState<T> {

        const profile = this._getProfile(key);

        if (profile.instance) {
            return profile.instance;
        }

        const state: SharedState<T> = new (stateClass as any)();

        const originalNext = state.next;

        profile.redlock = new Redlock([this.mainRedisClient], {
            driftFactor: 5,
            retryCount: 0,
            retryDelay: 0,
            retryJitter: 0,
        });

        // tslint:disable-next-line: no-this-assignment
        const manager = this;

        state.next = async function (this: T) {
            const padding = this.offset || manager.defaultPadding;
            let lock: Redlock.Lock;
            while (true) {
                try {
                    lock = await profile.redlock.acquire(manager._lockKeyOf(key), padding);
                    break;
                } catch (err) {
                    await delay(Math.floor(padding / 10));
                }

                if (!manager.trackedProfiles.has(key)) {
                    return;
                }
                if (!this.locked && (profile.refreshAt || 0 - Date.now()) > padding) {
                    return;
                }
            }

            const lockMessage = JSON.stringify({
                i: (await randomBytes(RANDOM_BYTES_LENGTH)).toString('base64'),
                k: key,
                l: Date.now() + padding
            });

            await manager.mainRedisClient.publish(manager._channelKeyOf(key), lockMessage);

            await delay(300);

            let result;
            try {
                result = await originalNext.call(this);
            } catch (err) {
                this.emit('error', err);
            }

            if (result) {
                await manager._setState(key, result);
            } else {
                const unlockMessage = JSON.stringify({
                    i: (await randomBytes(RANDOM_BYTES_LENGTH)).toString('base64'),
                    k: key,
                    l: 0
                });
                await manager.mainRedisClient.publish(manager._channelKeyOf(key), unlockMessage);
            }

            await lock.unlock();

            return result;
        };

        state.discard = function (this: T) {
            manager.discard(key);
        };

        profile.instance = state;


        return profile.instance;
    }


}
