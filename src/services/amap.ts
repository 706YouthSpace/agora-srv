import { DownstreamServiceError, HashManager, HTTPService, HTTPServiceConfig, HTTPServiceRequestOptions, retry } from "@naiverlabs/tskit";
import _ from "lodash";


const RETRY_INTERVAL_MS = 1500;
const RETRY_TIMES = 2;
export class AMapHTTP extends HTTPService {

    key?: string;
    secret?: string;
    md5Hasher = new HashManager('md5', 'hex');

    constructor(config: HTTPServiceConfig & { key?: string; secret?: string, baseUrl?: string }) {
        super(config.baseUrl || 'https://restapi.amap.com', config);
        this.key = config.key;
        this.secret = config.secret;
    }

    async __processResponse(config: HTTPServiceRequestOptions, resp: any) {
        const parsed = await super.__processResponse(config, resp);

        if (_.isPlainObject(parsed) && parsed.status === '0') {
            const err = new DownstreamServiceError(`Downstream service error: amap(${parsed.infocode}): ${parsed.info}`);

            throw err;
        }

        return parsed;
    }

    override urlOf(pathName: string, queryParams?: any): string {
        if (this.key) {
            queryParams.key = this.key;
        }
        if (this.key && this.secret) {
            const keys = Object.keys(queryParams);
            keys.sort();
            const qConcat = keys.map((key) => `${key}=${queryParams[key]}`).join('&');
            const sig = this.md5Hasher.hash(`${qConcat}${this.secret}`);
            queryParams.sig = sig;
        }

        return super.urlOf(pathName, queryParams);
    }

    @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
    async regeo(location: [number, number]) {
        const result = await this.getWithSearchParams<{
            regeocode: {
                addressComponent: {
                    country: string;
                    province: string;
                    city: string;
                    district: string;
                    township: string;
                    adcode: string;
                };
                formatted_address: string;
            }
        }>(
            '/v3/geocode/regeo',
            {
                location: `${location[0].toFixed(6)},${location[1].toFixed(6)}`
            }
        );

        return result.data;
    }


}
