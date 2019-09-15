import { Defer, Deferred } from './defer';

export class PromiseThrottle {
    serial = 0;
    finished = 0;
    throttle = 1;
    occupancy = 0;
    deferreds: Array<Deferred<this>> = [];
    private _nextTickRoutine = false;
    constructor(throttle = 3) {
        this.throttle = parseInt(Math.floor(throttle).toString(), 10);
    }

    routine() {
        this._nextTickRoutine = false;
        const leftovers = (this.serial - this.finished) - this.throttle;
        while (this.deferreds.length && (this.deferreds.length > leftovers)) {
            const handle = this.deferreds.shift();
            if (handle) {
                handle.resolve(this);
                this.occupancy += 1;
            }
        }
    }

    acquire() {
        this.serial += 1;
        const theDeferred = Defer<this>();
        this.deferreds.push(theDeferred);
        if (!this._nextTickRoutine) {
            this._nextTickRoutine = true;
            setImmediate(() => {
                this.routine();
            });
        }

        return theDeferred.promise;
    }

    release() {
        this.finished += 1;
        this.occupancy -= 1;
        this.routine();
    }

}
