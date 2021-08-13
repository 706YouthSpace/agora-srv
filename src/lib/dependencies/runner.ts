import { DependencyTracker, DependencyError } from './tracker';

import LRUCache from 'lru-cache';

export class DependencyRunner<T extends Function = () => Promise<any>> {
    tracker: DependencyTracker<T>;
    cache: LRUCache<T, T[][]> = new LRUCache({
        max: 50,
        // tslint:disable-next-line: no-magic-numbers
        maxAge: 3 * 60 * 1000,
        updateAgeOnGet: true
    });

    constructor(tracker: DependencyTracker<T>) {
        this.tracker = tracker;
    }

    plan(handle: T | string | symbol) {
        const vec = this.tracker.lookup(handle);

        if (!vec) {
            throw new DependencyError(`Unknown eneitity to run ${String(handle)}`);
        }

        const cached = this.cache.get(vec.value);

        if (cached) {
            return cached;
        }

        const plan = this.tracker.solve(handle);

        this.cache.set(vec.value, plan);

        return plan;
    }

    async run(handle: T | string | symbol, thisArg?: object, ...args: any[]) {
        const plan = this.plan(handle);

        for (const vec of plan) {
            const funcResults = vec.map((func) => func.call(thisArg, ...args));
            await Promise.all(funcResults);
        }

        return thisArg;
    }

}
