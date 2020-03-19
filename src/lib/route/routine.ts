import { ExtendedContext, Task } from './interfaces';

import { Defer } from '../defer';


export class TimeoutError extends Error { }

export const InterceptedException = { msg: 'Response Intercepted' };

async function noop(_ctx: ExtendedContext, next: () => (Promise<any> | undefined)) {
    return next();
}

const _ImplicitDependencies = new Set(['init', 'start', 'checkpoint']);

function _noop() { }

const DEFAULT_HTTP_RESPONSE_CODE = 404;
const DEFAULT_TTL_IN_SECONDS = 5;

export class Routine {
    dependencies: Map<string, Set<string>> = new Map();
    referencies: Map<string, Set<string>> = new Map();
    tasks: Map<string, Task> = new Map();
    routeParamDepth: Map<Task, number>;
    noopError: Error;
    ttl: number;
    constructor(tasks: Task[], routeParamDepth: Map<Task, number>, noopError: Error, ttl: number = DEFAULT_TTL_IN_SECONDS * 1000) {
        this.routeParamDepth = routeParamDepth;
        this.noopError = noopError;
        this.ttl = ttl;
        tasks.push({ func: noop as any, config: { name: 'init' } });
        tasks.push({ func: noop as any, config: { name: 'start', after: 'init' } });
        tasks.push({ func: noop as any, config: { name: 'checkpoint', after: 'start' } });
        const dupCheck = new Set();
        for (const task of tasks) {
            const name = task.config.name;
            if (!name) {
                continue;
            }
            if (dupCheck.has(name)) {
                throw new Error(`Duplicated task name in single routine: ${name}.`);
            }

            dupCheck.add(name);

            this.tasks.set(name, task);
            this.dependencies.set(name, new Set());
            this.referencies.set(name, new Set());
        }
        this._index();
        this._debugDependencies();
    }

    _index() {
        const everythingMentioned = new Set<string>();
        const explicitInvocations = new Set<string>();
        for (const [routeName, task] of this.tasks) {
            let befores = (Array.isArray(
                task.config.before) ? task.config.before : [task.config.before]
            ) as string[];
            let afters = (Array.isArray(
                task.config.after) ? task.config.after : [task.config.after]
            ) as string[];
            befores = befores[0] ? befores : [];
            afters = afters[0] ? afters : [];
            if (task.config.invocation === 'explicit') {
                explicitInvocations.add(routeName);
            }
            const ref1 = this.referencies.get(routeName);
            if (!ref1) {
                throw new Error(`Dependency Error: ${routeName} not registered in references.`);
            }
            for (const x of befores) {
                const dep1 = this.dependencies.get(x);
                if (!dep1) {
                    throw new Error(`Dependency Error: ${x} after ${routeName} but not provided.`);
                }
                dep1.add(routeName);
                ref1.add(x);
                everythingMentioned.add(x);
            }
            const dep2 = this.dependencies.get(routeName);
            if (!dep2) {
                throw new Error(`Dependency Error: ${routeName} not registered in dependencies.`);
            }
            for (const x of afters) {
                dep2.add(x);
                const ref2 = this.referencies.get(x);
                if (!ref2) {
                    throw new Error(`Dependency Error: ${x} before ${routeName} but not provided.`);
                }
                ref2.add(routeName);
                everythingMentioned.add(x);
            }
        }
        for (const x of everythingMentioned) {
            if (!this.tasks.has(x)) {
                throw new Error('Impossible Dependency: ' + x);
            }
        }

        for (const x of explicitInvocations) {
            const tmpSet = new Set(this.referencies.get(x)!);
            for (const _i of _ImplicitDependencies) {
                tmpSet.delete(_i);
            }
            if (tmpSet.size === 0) {
                const deps = this.dependencies.get(x)!;
                for (const d of deps) {
                    this.referencies.get(d)!.delete(x);
                }
                const refs = this.referencies.get(x)!;
                for (const d of refs) {
                    this.dependencies.get(d)!.delete(x);
                }
                this.tasks.delete(x);
                this.referencies.delete(x);
                this.dependencies.delete(x);
            }
        }

        return this;
    }

    _debugDependencies() {
        const unsatisfied = new Set<string>(this.tasks.keys());
        for (const dependencies of this.dependencies.values()) {
            for (const dependency of dependencies) {
                unsatisfied.add(dependency);
            }
        }
        let lastUnsatisfiedSize: number;
        do {
            lastUnsatisfiedSize = unsatisfied.size;
            for (const [routeName, dependencies] of this.dependencies) {
                let isSatisfied = true;
                for (const dependency of dependencies) {
                    if (unsatisfied.has(dependency)) {
                        isSatisfied = false;
                        break;
                    }
                }
                if (!isSatisfied) {
                    continue;
                }

                unsatisfied.delete(routeName);
            }
        } while (lastUnsatisfiedSize > unsatisfied.size);
        if (unsatisfied.size > 0) {
            const unsatisfiedArray: string[] = [];
            for (const x of unsatisfied) { unsatisfiedArray.push(x); }
            throw new Error(`Dependency error: unsatisfied dependencies ${unsatisfiedArray} .`);
        }
    }

    async fork(ctx: ExtendedContext, routeParamVersions: Array<{ [key: string]: string }>, done?: () => Promise<any>): Promise<any> {
        const nextDeferreds = new Map();
        const finalDeferreds = new Map();
        const dependencyPromises = new Map<string, Promise<any>>();
        const finalAwaitPromises: Array<Promise<any>> = [];

        for (const [taskName] of this.tasks) {
            const nd = Defer();
            const fd = Defer();
            nd.promise.catch(_noop);
            fd.promise.catch(_noop);
            nextDeferreds.set(taskName, nd);
            finalDeferreds.set(taskName, fd);
        }

        for (const [taskName, taskDependencies] of this.dependencies) {
            // const taskFunc = this.tasks.get(taskName)!;
            let taskDependencyPromise: Promise<any> | undefined = undefined;
            if (taskDependencies.size === 0) {
                taskDependencyPromise = Promise.resolve();
                // console.log('rootTask: ' + taskName);
                finalAwaitPromises.push(finalDeferreds.get(taskName).promise);
                // finalDeferreds.get(taskName).promise.catch((err: any) => {
                //     console.log('rootTask ' + taskName + ' Exception' + err);
                // });
            } else {
                const taskDependencyPromises: Array<Promise<any>> = [];
                for (const x of taskDependencies) {
                    taskDependencyPromises.push(nextDeferreds.get(x).promise);
                }
                taskDependencyPromise = Promise.all(taskDependencyPromises);
            }
            dependencyPromises.set(taskName, taskDependencyPromise);
        }

        const processFunc = (task: Task) => {
            const taskConf = task.config;
            let timeoutObj: NodeJS.Timer | undefined = undefined;
            try {
                if (taskConf.ttl && taskConf.ttl > 0) {
                    timeoutObj = setTimeout(
                        () => {
                            timeoutObj = undefined;
                            const err = new TimeoutError(`Middleware timeout before calling next: ${taskConf.name}`);
                            nextDeferreds.get(taskConf.name).reject(err);
                            finalDeferreds.get(taskConf.name).reject(err);
                        },
                        taskConf.ttl
                    );
                }
                const taskReferencePromises: Array<Promise<any>> = [];
                for (const x of this.referencies.get(taskConf.name!)!) {
                    taskReferencePromises.push(finalDeferreds.get(x).promise);
                }
                const allReferencesPromise = Promise.all(taskReferencePromises);
                // console.log('starting: ' + taskConf.name);
                const resultPromise = task.func.call(
                    taskConf.thisArg,
                    Object.assign(ctx, { routeParam: routeParamVersions[this.routeParamDepth.get(task) || 0] }),
                    (err?: Error) => {
                        if (err) {
                            nextDeferreds.get(taskConf.name).reject(err);

                            return Promise.reject(err);
                        }
                        if (timeoutObj) {
                            clearTimeout(timeoutObj);
                            timeoutObj = undefined;
                        }
                        nextDeferreds.get(taskConf.name).resolve();

                        return allReferencesPromise.then(() => {
                            if (taskConf.ttl && taskConf.ttl > 0) {
                                timeoutObj = setTimeout(
                                    () => {
                                        timeoutObj = undefined;
                                        finalDeferreds.get(taskConf.name)
                                            .reject(new TimeoutError(`Middleware timeout after calling next: ${taskConf.name}`));
                                    },
                                    taskConf.ttl
                                );
                            }
                        });
                    }
                );

                if (!resultPromise || !(typeof resultPromise.then === 'function')) {
                    // console.log('done: ' + taskConf.name + 'with custom value');
                    nextDeferreds.get(taskConf.name).reject(InterceptedException);
                    finalDeferreds.get(taskConf.name).resolve(resultPromise);
                } else {
                    // tslint:disable-next-line: no-floating-promises
                    resultPromise.then(() => {
                        // console.log('done: ' + taskConf.name + 'with custom promise');
                        nextDeferreds.get(taskConf.name).reject(InterceptedException);
                    });
                    finalDeferreds.get(taskConf.name).resolve(Promise.all([resultPromise, allReferencesPromise]));
                }

            } catch (err) {
                nextDeferreds.get(taskConf.name).reject(err);
                finalDeferreds.get(taskConf.name).reject(err);
            }

        };
        for (const [taskName, taskDependencyPromise] of dependencyPromises) {
            taskDependencyPromise.then(
                () => {
                    // console.log('dependency resolve:' + taskName)
                    // setImmediate(processFunc, this.tasks.get(taskName));
                    processFunc(this.tasks.get(taskName)!);
                },
                (err) => {
                    nextDeferreds.get(taskName).reject(err);
                    finalDeferreds.get(taskName).reject(err);
                }
            );
        }

        return Promise.all(finalAwaitPromises).then(
            (_results: any[]) => {
                if (ctx.status === DEFAULT_HTTP_RESPONSE_CODE && !ctx.response.body && !ctx.body) {
                    throw this.noopError;
                }
                if (typeof done === 'function') {
                    // console.log('calling Done');
                    return done();
                }

                return undefined;
            },
            (err) => {
                if (err === InterceptedException) {
                    if (ctx.status === DEFAULT_HTTP_RESPONSE_CODE && !ctx.response.body && !ctx.body) {
                        throw this.noopError;
                    }
                    if (typeof done === 'function') {
                        // console.log('calling Done via except');
                        return done();
                    }
                } else {
                    throw err;
                }

                return undefined;
            }
        );
    }

}
