import { PromiseThrottle } from './throttol';
import { delay } from './simple-tools';
import { EventEmitter } from 'events';

export interface IndefiniteLoopOptions {
    concurrency?: number;
    interval?: number;
    condition?: (loopDashboard: LoopDashboard) => boolean | Promise<boolean>;
    onReturn?: (result: any, loopDashboard: LoopDashboard) => any;
    onThrowUp?: (error: any, loopDashboard: LoopDashboard) => any;
    overrideThis?: any;
    maxFail?: number;
}

export class MaxFailReachedError extends Error {}

export class LoopDashboard extends EventEmitter {
    keepLooping: boolean = true;
    succ: number = 0;
    fail: number = 0;
    cycle: number = 0;
    concurrency: number = 1;
    interval: number = 0;
    maxFail?: number;

    throttler: PromiseThrottle;

    constructor(t0Concurrency?: number, t0Interval?: number, maxFail?: number) {
        super();

        this.concurrency = t0Concurrency || 1;
        this.interval = t0Interval || 0;
        this.throttler = new PromiseThrottle(parseInt(this.concurrency as any, 10));
        this.maxFail = maxFail;
    }

    stop() {
        this.keepLooping = false;
    }

    setConcurrency(x: number) {
        this.concurrency = parseInt(x as any, 10) || 1;
        if (this.concurrency > this.throttler.throttle) {
            this.throttler.throttle = this.concurrency;
            this.throttler.routine();
        } else {
            this.throttler.throttle = this.concurrency;
        }
    }

    setInterval(x: number) {
        this.interval = parseInt(x as any, 10) || 0;
    }

    getOccupancy() {
        return this.throttler.occupancy;
    }
}


export function indefiniteLoop(options: IndefiniteLoopOptions = {}) {
    return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {

        const originalFunc = descriptor.value;

        function newContextAndRun(thisArg: any, args: any[]) {
            const t0Concurrency = options.concurrency || 1;
            const t0Interval = options.interval || 1000;

            const control = new LoopDashboard(t0Concurrency, t0Interval, options.maxFail);

            const worker = async () => {
                try {
                    control.cycle += 1;
                    control.emit('cycle', control.cycle);
                    const keepOn = (typeof options.condition === 'function' ?
                        Boolean(await options.condition.call(options.overrideThis || thisArg || _target, control)) : true);
                    if (keepOn) {
                        const r = await originalFunc.call(options.overrideThis || thisArg || _target, ...args);
                        control.succ += 1;
                        control.emit('success', r, control.succ);
                        if (typeof options.onReturn === 'function') {
                            options.onReturn.call(options.overrideThis || thisArg || _target, r, control);
                        }
                    } else {
                        control.stop();
                    }
                } catch (err) {
                    control.fail += 1;
                    control.emit('failure', err, control.fail);
                    if (typeof options.onThrowUp === 'function') {
                        options.onThrowUp.call(options.overrideThis || thisArg || _target, err, control);
                    } else {
                        throw err;
                    }

                    if (control.maxFail && control.fail >= control.maxFail) {

                        throw new MaxFailReachedError(`Failure exceded ${control.maxFail} times.`);

                    }
                }
            };

            const looper = async () => {
                while (control.keepLooping) {
                    await control.throttler.acquire();

                    worker().then(() => {
                        control.throttler.release();
                    }, (err) => {
                        // Error should be handled by onThrowUp.
                        // If it endup thrown up here, the looping is stopped.
                        control.throttler.release();
                        control.emit('error', err);

                        control.stop();
                    });

                    if (control.interval && control.interval > 0) {
                        await delay(control.interval);
                    }
                }
                control.emit('stopped', control.cycle);
            };

            looper().catch((err) => control.emit('error', err));

            return control;
        }


        descriptor.value = function (...argv: any[]) {
            return newContextAndRun(this, argv);
        };

        return descriptor;
    };
}

