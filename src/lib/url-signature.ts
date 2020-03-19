import _ from 'lodash';
import { HashManager } from './hash';
import { pseudoRandomBytes } from 'crypto';


export class UrlSignatureManager {

    hasher: HashManager;

    constructor(hasher: HashManager) {
        this.hasher = hasher;
    }

    signature(param: { [k: string]: string }) {
        const paramVecs = _.toPairs(param);

        const sortedVecs = _.sortBy(paramVecs, (x) => x[0]);

        const stringToSign = sortedVecs.map((x) => x[1]).join('-');

        return this.hasher.hash(stringToSign) as string;
    }

}


export interface AliDnsSignatureOptions {
    filename: string;
    timestamp?: number;
    rand?: string;
    uid?: string;
}

export class AliCDNSignatureManager {
    authKey: string;
    hasher: HashManager = new HashManager('md5', 'hex');
    window: number = 1800;

    constructor(key: string) {
        this.authKey = key;
    }

    signature(param: AliDnsSignatureOptions) {
        const stringToSignP1 =
            `${param.timestamp || (Math.floor(Date.now() / 1000) + this.window)}-${param.rand || pseudoRandomBytes(16).toString('hex')}-${param.uid || 0}`;

        const stringToSignP2 = `${param.filename}-${stringToSignP1}`;
            
        const stringToSignP3 = `${stringToSignP2}-${this.authKey}`;

        return `${stringToSignP1}-${this.hasher.hash(stringToSignP3)}` as string;
    }
}
