import _ from 'lodash';
import { Readable } from 'stream';
import { Defer, TimeoutError } from './defer';

export function simpleFlattenedParams(...params: Array<string | string[] | undefined>) {
    return _(params)
        .map((x) => (typeof x) === 'string' ? (x as string).split(',') : x)
        .flattenDeep().compact().uniq().value() as string[];
}

export function drainReadable(stream: Readable) {
    const deferred = Defer<Buffer>();
    const chunks: Array<string | Buffer> = [];
    stream.on('error', deferred.reject);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => deferred.resolve(Buffer.concat(chunks.map((x) => Buffer.isBuffer(x) ? x : Buffer.from(x)))));
    stream.resume();

    return deferred.promise;
}

export function delay(ms: number) {

    const deferred = Defer();
    if (!ms || ms <= 0) {
        deferred.resolve();

        return deferred.promise;
    }

    setTimeout(deferred.resolve, ms, ms);

    return deferred.promise;
}

export function timeout(ms: number) {

    const deferred = Defer();
    if (!ms || ms <= 0) {
        deferred.resolve();

        return deferred.promise;
    }

    setTimeout(deferred.reject, ms, new TimeoutError(`Timedout after ${ms}ms`));

    return deferred.promise;
}

function _vectorize(obj: object, stack: string[] = []) {
    const vectors: Array<[string, any]> = [];
    for (const x in obj) {
        if (obj.hasOwnProperty(x)) {
            const val = (obj as any)[x];
            if (typeof val === 'object' && !Array.isArray(val)) {
                vectors.push(..._vectorize(val, stack.concat(x)));
            } else {
                vectors.push([stack.concat(x).join('.'), val]);
            }
        }
    }

    return vectors;
}

export function vectorize(obj: object) {
    return _.fromPairs(_vectorize(obj));
}
