import { ResourceNotFoundError, RPCHost } from "tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick, RPCMethod } from "./civi-rpc";
import { GB2260 } from "../lib/gb2260";

@singleton()
export class GB2260RPCHost extends RPCHost {

    constructor(
        protected gb2260: GB2260
    ) {
        super(...arguments);
    }

    async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    @RPCMethod('gb2260.getProvinces')
    getGB2260Provinces() {
        return this.gb2260.getProvinces().map((x) => _.omit(x, 'children'));
    }

    @RPCMethod('gb2260.getProvince')
    getGB2260Province(@Pick('code', { required: true }) code: string) {
        const result = this.gb2260.getProvince(code);

        if (!result) {
            throw new ResourceNotFoundError({
                message: 'Province Not Found',
                code
            });
        }

        return result;
    }

    @RPCMethod('gb2260.getCities')
    getGB2260Cities(@Pick('code', { required: true }) code: string) {

        const result = this.gb2260.getProvince(code)?.children;

        if (!result) {
            throw new ResourceNotFoundError({
                message: 'Province Not Found',
                code
            });
        }

        return this.gb2260.getProvince(code)?.children;
    }

    @RPCMethod('gb2260.getCity')
    getGB2260City(@Pick('code', { required: true }) code: string) {

        const result = this.gb2260.getCity(code);

        if (!result) {
            throw new ResourceNotFoundError({
                message: 'City Not Found',
                code
            });
        }

        return result;
    }

    @RPCMethod('gb2260.getCounties')
    getGB2260Counties(@Pick('code', { required: true }) code: string) {

        const result = this.gb2260.getCity(code)?.children;

        if (!result) {
            throw new ResourceNotFoundError({
                message: 'City Not Found',
                code
            });
        }

        return result
    }
}
