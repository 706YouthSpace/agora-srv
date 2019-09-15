import { Defer } from './defer';

export function retry(maxTries: number, delayInMs: number = 0) {
    return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {

        const originalFunc = descriptor.value;

        function newContextAndRun(thisArg: any, args: any[]) {
            const deferred = Defer<any>();
            let triesLeft = Math.abs(maxTries);
            const errors: any[] = [];
            async function retryWorker(tgt: any, argv: any[]) {
                if (triesLeft <= 0) {
                    const lastError = errors.pop();
                    if (errors.length) {
                        lastError.historicalErrors = errors;
                    }

                    return deferred.reject(lastError);
                }
                let rVal: any;
                triesLeft -= 1;
                try {
                    rVal = await originalFunc.apply(tgt, argv);
                } catch (err) {
                    errors.push(err);
                    if (triesLeft > 0) {
                        setTimeout(retryWorker, delayInMs, tgt, argv);
                    } else {
                        const lastError = errors.pop();
                        if (errors.length) {
                            lastError.historicalErrors = errors;
                        }

                        return deferred.reject(lastError);
                    }

                    return;
                }

                return deferred.resolve(rVal);
            }

            retryWorker(thisArg, args).catch(() => null);

            return deferred.promise;
        }


        descriptor.value = function (...argv: any[]) {
            return newContextAndRun(this, argv);
        };

        return descriptor;
    };
}

