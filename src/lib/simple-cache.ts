import { EventEmitter } from 'events';

export class SimpleCache<T1, T2> extends EventEmitter {
    ttl: number;
    maxAge: number | null;

    protected resource: Map<T1, T2> = new Map();
    protected lastAccessedAt: Map<T1, number> = new Map();
    protected createdAt: Map<T1, number> = new Map();
    protected routineInterval: NodeJS.Timer;


    constructor(ttlInMs?: number | string, maxAgeInMs?: number | string | null) {
        super();
        this.ttl = parseInt(ttlInMs as any, 10) || 1 * 60 * 1000;
        this.maxAge = parseInt(maxAgeInMs as any, 10) || null;
        this.routineInterval = this.kickOff();
    }

    kickOff() {
        const interval = setInterval(() => {
            const nowTime = Date.now();
            for (const id of this.resource.keys()) {
                if (this.lastAccessedAt.get(id) || 0 + this.ttl <= nowTime) {
                    this.unset(id);
                    continue;
                }
                if (this.maxAge && ((this.createdAt.get(id) || 0 + this.maxAge) <= nowTime)) {
                    this.unset(id);
                }
            }
        }, this.ttl * 1.02);
        this.routineInterval.unref();
        this.emit('start');

        this.routineInterval = interval;

        return interval;
    }

    stop() {
        clearInterval(this.routineInterval);
        this.emit('stop');
    }



    unset(id: T1) {
        this.lastAccessedAt.delete(id);
        this.createdAt.delete(id);
        const theStuff = this.resource.get(id);
        this.resource.delete(id);
        this.emit('drop', theStuff, id);
    }

    refresh(id: T1) {
        if (this.resource.has(id)) {
            const nowTime = Date.now();
            this.lastAccessedAt.set(id, nowTime);
        }
    }

    get(id: T1) {
        this.refresh(id);

        return this.resource.get(id);
    }

    has(id: T1) {
        return this.resource.has(id);
    }

    set(id: T1, val: T2) {
        const nowTime = Date.now();
        this.resource.set(id, val);
        this.createdAt.set(id, nowTime);
        this.lastAccessedAt.set(id, nowTime);

        this.emit('data', val, id);
    }

}
