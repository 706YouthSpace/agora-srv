// tslint:disable: variable-name
import { EventEmitter } from 'events';
import _ from 'lodash';

import { Defer, Deferred } from './defer';

let GLOBAL_PROCEDURE_COUNTER = 0;
const DEFAULT_CATEGORY_NAME = 'DEFAULT';

export class TimeoutError extends Error { }

export enum ProcedureStatus {
    BEFORESTART = 'BEFORESTART',
    STARTED = 'STARTED',
    PROGRESS = 'PROGRESS',
    PARTIAL_RESULT = 'PARTIAL_RESULT',
    FAILED = 'FAILED',
    DONE = 'DONE'
}

const pStatusLevel = ['BEFORESTART', 'STARTED', 'PROGRESS', 'PARTIAL_RESULT', 'DONE', 'FAILED'];

const MAP_EVENT_TO_STATUS: any = {
    beforeStart: ProcedureStatus.BEFORESTART,
    start: ProcedureStatus.STARTED,
    progress: ProcedureStatus.PROGRESS,
    partial: ProcedureStatus.PARTIAL_RESULT,
    error: ProcedureStatus.FAILED,
    end: ProcedureStatus.DONE
};

const MAP_STATUS_TO_EVENT = _.reverse(MAP_EVENT_TO_STATUS);

export type PROCEDUREFunction = (p: Procedure, context: {
    argv: any[];
    result?: any;
    [k: string]: any;
}) => any | Promise<any>;

export class Procedure extends EventEmitter {
    serial: number;
    category: string;
    status: ProcedureStatus;
    startTime?: number;
    lastEventTime?: number;
    context: any = {};

    __promise?: Promise<any>;

    __sTimeout?: NodeJS.Timer;
    __spTimeout?: NodeJS.Timer;

    protected namedDeferreds: { [x: string]: Deferred<any> } = {};

    constructor(category: string = DEFAULT_CATEGORY_NAME) {
        super();
        this.serial = GLOBAL_PROCEDURE_COUNTER++;
        this.category = category;
        this.status = ProcedureStatus.BEFORESTART;
    }

    get promise() {
        if (this.__promise) {
            return this.__promise;
        }
        this.__promise = this.waitFor('end').then((r) => Array.isArray(r) ? r[0] : r);

        return this.__promise;
    }

    get result() {
        return this.context.result;
    }

    set result(val: any) {
        this.context.result = val;
    }

    init(...argv: any[]) {
        return this._recv('beforeStart', ...argv);
    }

    started(...argv: any[]) {
        return this._recv('start', ...argv);
    }

    progress(...argv: any[]) {
        return this._recv('progress', ...argv);
    }

    done(...argv: any[]) {
        return this._recv('end', ...argv);
    }

    partialResult(...argv: any[]) {
        return this._recv('partial', ...argv);
    }

    fail(...argv: any[]) {
        return this._recv('error', ...argv);
    }

    kill(...argv: any[]) {
        return this._recv('kill', ...argv);
    }

    getDeferred(eventName: string) {
        const target = this.namedDeferreds[eventName];
        if (target) {
            return target;
        }
        const newDeferred = Defer<any>();
        this.namedDeferreds[eventName] = newDeferred;

        return newDeferred;
    }

    waitFor(eventName: string) {
        return this.getDeferred(eventName).promise;
    }

    resolve(eventName: string, value: any) {
        return this.getDeferred(eventName).resolve(value);
    }

    reject(eventName: string, value: any) {
        return this.getDeferred(eventName).reject(value);
    }

    _recv(eventName: string, ...argv: any[]) {
        const nowTime = Date.now();
        this.lastEventTime = nowTime;
        if (eventName === 'start' && !this.startTime) {
            this.startTime = this.lastEventTime;
        }

        const evIndx = pStatusLevel.indexOf(MAP_EVENT_TO_STATUS[eventName]);
        const curStatusIndx = pStatusLevel.indexOf(this.status);
        if (evIndx > curStatusIndx) {
            for (let i = curStatusIndx; i < evIndx; i++) {
                const stat = pStatusLevel[i];
                this.emit(MAP_STATUS_TO_EVENT[stat], ...argv);
            }

            this.status = MAP_EVENT_TO_STATUS[eventName];
        }

        this.emit(eventName, ...argv);

        return this.getDeferred(eventName).promise;
    }

    emit(event: string, ...argv: any[]) {
        if (event === 'error') {
            let r1: boolean = false;
            try {
                r1 = super.emit(event, ...argv);
            } catch (err) {
                void 0;
            }

            if (r1) {
                this.getDeferred('error').promise.catch((err: any) => {
                    this.status = ProcedureStatus.FAILED;
                    for (const x of Object.values(this.namedDeferreds)) {
                        x.reject(err);
                    }
                });
            } else {
                this.status = ProcedureStatus.FAILED;
                for (const x of Object.values(this.namedDeferreds)) {
                    x.reject(argv[0]);
                }
            }

            return true;
        }

        const r = super.emit(event, ...argv);

        if (!r) {
            this.resolve(event, argv[0]);
        }

        return true;
    }

    setTimeout(tInMs: number) {
        this.waitFor('start').then(() => {
            const nowTime = Date.now();
            const timeLeft = tInMs - (nowTime - this.startTime!);
            if (timeLeft <= 0) {
                return this.fail(new TimeoutError(`Procedure timed out after: ${(nowTime - this.startTime!)}ms`));
            }
            if (this.__sTimeout) {
                clearTimeout(this.__sTimeout);
            }
            this.__sTimeout = setTimeout(
                () => {
                    if (this.status !== ProcedureStatus.DONE && this.status !== ProcedureStatus.FAILED) {
                        return this.fail(new TimeoutError(`Procedure timed out after: ${tInMs}`));
                    }

                    return;
                },
                timeLeft
            );

            return;
        }).catch();

    }

    setProgressTimeout(tInMs: number) {
        this.waitFor('start').then(() => {
            const nowTime = Date.now();
            const timeLeft = tInMs - (nowTime - this.lastEventTime!);
            if (timeLeft <= 0) {
                return this.fail(new TimeoutError(`Procedure timed out after: ${(nowTime - this.startTime!)}ms`));
            }
            const checkAfter = (t1: number, t2: number) => {
                return setTimeout(
                    () => {
                        const tn = this.lastEventTime || t2;
                        if (tn <= t2) {
                            return this.fail(new TimeoutError(`Procedure timed out after: ${tInMs}`));
                        }

                        if (this.status !== ProcedureStatus.DONE && this.status !== ProcedureStatus.FAILED) {
                            const time2 = Date.now();
                            this.__spTimeout = checkAfter(tInMs - (time2 - tn), time2);
                        }

                        return;
                    },
                    t1
                );
            };
            if (this.__spTimeout) {
                clearTimeout(this.__spTimeout);
            }
            this.__spTimeout = checkAfter(timeLeft, nowTime);

            return;
        }).catch();
    }
}

const MATCH_ALL_CATAGORY = 'ALL';

const TRACKED_EVENTS = ['beforeStart', 'start', 'progress', 'partial', 'end', 'error', 'kill'];

export class ProcedureManager extends EventEmitter {
    protected defaultTimeoutMs = 60000;

    procedures: Map<number, Procedure> = new Map();

    procedureSerialCounter = 0;

    pPlugins: Map<string, { [k: string]: PROCEDUREFunction[] }> = new Map();

    constructor() {
        super();
    }

    protected _initPluginListeners(p: Procedure) {
        for (const eventName of TRACKED_EVENTS) {
            const pluginCategory = this._getCategory(p.category);
            const pluginsP1 = pluginCategory[eventName];
            const matchAllCategory = this._getCategory(MATCH_ALL_CATAGORY);
            const pluginsP3 = matchAllCategory[eventName];
            const plugins: any[] = [];
            if (pluginsP1 && pluginsP1.length) {
                plugins.push(...pluginsP1);
            }
            if (pluginsP3 && pluginsP3.length) {
                plugins.push(...pluginsP3);
            }

            if (plugins.length) {

                const listener = async (event: string, ...argv: any[]) => {
                    if (!event) {
                        return;
                    }

                    const fakedObj = { argv, result: undefined };
                    const { proxy, revoke } = Proxy.revocable(p.context, {
                        get: (tgt, prop) => {
                            if (fakedObj.hasOwnProperty(prop)) {
                                return Reflect.get(fakedObj, prop);
                            }

                            return Reflect.get(tgt, prop);
                        },
                        set: (tgt, prop, val) => {
                            if (fakedObj.hasOwnProperty(prop)) {
                                return Reflect.set(fakedObj, prop, val);
                            }

                            return Reflect.set(tgt, prop, val);
                        }
                    });
                    try {
                        for (const plugin of plugins) {
                            const r = await plugin.call(undefined, proxy, ...proxy.argv);
                            if (r !== undefined) {
                                proxy.result = r;
                            }
                        }

                        p.resolve(event, fakedObj.result);
                    } catch (err) {
                        p.fail(err).catch();
                    }

                    revoke();
                };

                p.on(eventName, listener);
            }
        }

    }

    protected _getCategory(name: string) {
        let r = this.pPlugins.get(name);
        if (!r) {
            r = {};
            this.pPlugins.set(name, r);
        }

        return r;
    }

    addPlugin(category: string, phrase: string, func: (p: Procedure, ...argv: any[]) => any) {
        if (!(category && phrase && (typeof func === 'function'))) {
            throw new Error('Invalid plugin registration');
        }
        const theCategory = this._getCategory(category);
        const plugins = theCategory[phrase];
        if (plugins) {
            plugins.push(func);
        } else {
            theCategory[phrase] = [func];
        }
    }

    prependPlugin(category: string, phrase: string, func: PROCEDUREFunction) {
        const theCategory = this._getCategory(category);
        const plugins = theCategory[phrase];
        if (plugins) {
            plugins.push(func);
        } else {
            theCategory[phrase] = [func];
        }
    }

    _e(event: string, x: number | Procedure, ...argv: any[]) {
        let p: Procedure | undefined;
        if (typeof x === 'number') {
            p = this.procedures.get(x);
        } else {
            p = x;
        }
        if (!p) {
            return;
        }
        this.emit(event, event, p, ...argv);
    }

    createProcedure(category?: string, ...argv: any[]) {
        const newProcedure = new Procedure(category);

        this.procedures.set(newProcedure.serial, newProcedure);

        this._initPluginListeners(newProcedure);

        // tslint:disable-next-line: no-floating-promises
        newProcedure.init(...argv);

        return newProcedure;
    }
}
