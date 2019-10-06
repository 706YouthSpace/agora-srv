import _ from 'lodash';
import { HashManager } from './hash';


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
