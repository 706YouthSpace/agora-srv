// tslint:disable
import { Subject } from 'rxjs';

export function firstPushOf<T = any>(subj: Subject<T>, timeout?: number) {
    return new Promise<T>((resolve, reject) => {
        let subscription: any;
        function unsubscribe() {
            setImmediate(() => {
                subscription.unsubscribe();
            });
        }
        subscription = subj.subscribe((r) => {
            resolve(r);
            unsubscribe();
        }, (err) => {
            reject(err);
            unsubscribe();
        }, () => {
            reject(new Error('End of subject before receiving first value.'));
            unsubscribe();
        });
        if (timeout) {
            setTimeout(() => reject(new Error(`Operation timedout after ${timeout}ms.`)), timeout);
        }
    });

}

export function firstCompactPushOf<T = any>(subj: Subject<T>, timeout?: number) {
    return new Promise<T>((resolve, reject) => {
        let subscription: any;
        function unsubscribe() {
            setImmediate(() => {
                subscription.unsubscribe();
            });
        }
        subscription = subj.subscribe((r) => {
            if (r !== undefined && r !== null) {
                resolve(r);
                unsubscribe();
            }
        }, (err) => {
            reject(err);
            unsubscribe();
        }, () => {
            reject(new Error('End of subject before receiving first compact value.'));
            unsubscribe();
        });
        if (timeout) {
            setTimeout(() => reject(new Error(`Operation timedout after ${timeout}ms.`)), timeout);
        }
    });

}
