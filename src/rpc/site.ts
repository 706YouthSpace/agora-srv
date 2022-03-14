import { RequestedEntityNotFoundError, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { ObjectId } from "bson";
import { URL } from "url";
import _ from "lodash";

import { Pick, RPCMethod } from "./civi-rpc";
import { MongoSite, Site, SITE_TYPE } from "../db/site";
import { MongoEvent, EVENT_SENSOR_STATUS } from "../db/event";
import { DraftSiteForCreation, wxGcj02LongitudeLatitude } from "./dto/site";
import { Pagination } from "./dto/pagination";
import { GB2260, GB2260Node } from "../lib/gb2260";
import { MongoUser } from "../db/user";

enum GB2260GRAN {
    PROVINCE = 'province',
    CITY = 'city',
    COUNTY = 'county'
}

@singleton()
export class SiteRPCHost extends RPCHost {

    constructor(
        protected mongoSite: MongoSite,
        protected gb2260: GB2260,
        protected mongoEvent: MongoEvent,
        protected mongoUser: MongoUser
    ) {
        super(...arguments);

        this.init();
    }

    async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    convertURLOrObjId(data: URL | ObjectId | undefined) {
        if (!data) {
            return undefined;
        }

        if (ObjectId.isValid(data as ObjectId)) {
            return data as ObjectId;
        }

        return data.toString();
    }

    escapeRegExp(input: string) {
        return input.replace(/[#-.]|[[-^]|[?|{}]/g, '\\$&');
    }

    @RPCMethod('site.create')
    async create(draft: DraftSiteForCreation) {
        const site = Site.from<Site>(draft);

        const r = await this.mongoSite.create(site);

        return r;
    }

    @RPCMethod('site.list')
    async list(
        pagination: Pagination,
        @Pick('name') name?: string,
        @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
        @Pick('location') locationText?: string,
        @Pick('locationGB2260') locationGB2260?: string,
        @Pick('locationNear', { arrayOf: Number, validateCollection: wxGcj02LongitudeLatitude })
        locationNear?: [number, number],
        @Pick('distance', { arrayOf: Number, validate: (x: number) => x > 0 })
        distance?: number,
        @Pick('tags', { arrayOf: String }) tags?: string[]
    ) {
        const query: any = {};

        if (name) {
            query.name = { $regex: new RegExp(`.*${this.escapeRegExp(name)}.*`, 'gi') };
        }

        if (type) {
            query.type = { $in: type };
        }

        if (tags) {
            query.tags = { $in: tags };
        }

        if (locationText) {
            query.locationText = { $regex: new RegExp(`.*${this.escapeRegExp(locationText)}.*`, 'gi') };
        }

        if (locationGB2260) {
            query.locationGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locationGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
        }

        if (locationNear && distance) {
            query.locationCoord = {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: locationNear,
                    },
                    $maxDistance: distance
                }
            }
        }

        if (pagination.getAnchor()) {
            query.updatedAt = { $lt: pagination.getAnchor() };
        }
        const result = await this.mongoSite.collection.find(query)
            .sort({ updatedAt: -1 })
            .skip(pagination.getSkip())
            .limit(pagination.getLimit())
            .toArray();

        pagination.setMeta(result);

        return result;
    }

    @RPCMethod('site.get')
    async get(
        @Pick('id') id: ObjectId
    ) {
        const site = await this.mongoSite.get(id) as Site;

        if (!site) {
            throw new RequestedEntityNotFoundError(`Site with id ${id} not found`);
        }

        const eventQuery = {
            site: site._id,
            status: EVENT_SENSOR_STATUS.PASSED
        }
        const activities = await this.mongoEvent.simpleFind(eventQuery, {
            sort: { createdAt: -1 },
            limit: 20
        });

        const creator = site.creator ? await this.mongoUser.get(site.creator) : undefined;

        return {
            ...site,

            activities,
            creator
        };
    }

    @RPCMethod('site.gb2260.list')
    async getGB2260(
        @Pick('granularity', { type: GB2260GRAN, default: GB2260GRAN.CITY }) gb2260Granularity: GB2260GRAN,
        @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
    ) {
        const query: any = {};

        if (type) {
            query.type = { $in: type };
        }

        let gb2260SubstrLength = 4;

        switch (gb2260Granularity) {
            case GB2260GRAN.PROVINCE: {
                gb2260SubstrLength = 2;
                break;
            }
            case GB2260GRAN.CITY: {
                gb2260SubstrLength = 4;
                break;
            }
            case GB2260GRAN.COUNTY: {
                gb2260SubstrLength = 6;
                break;
            }
            default: {
                break;
            }
        }

        const r = await this.mongoSite.collection.aggregate<{ _id: string }>([
            { $match: query },
            {
                $group: {
                    _id: { $substrBytes: ['$locationGB2260', 0, gb2260SubstrLength] }
                }
            },
        ]).toArray();

        const zeros = '000000';
        const areaCodes = r.filter((x) => x._id).map((x) => x._id + zeros.substring(0, 6 - x._id.length));

        let final: any[] | undefined;
        console.log(areaCodes);
        switch (gb2260Granularity) {
            case GB2260GRAN.PROVINCE: {
                final = areaCodes.map((x) => this.gb2260.getProvince(x)).map((x) => _.omit(x, 'children')) as GB2260Node[];
                break;
            }
            case GB2260GRAN.CITY: {
                final = areaCodes.map((x) => {
                    const city = this.gb2260.getCity(x);
                    const province = this.gb2260.getProvince(x);

                    if (city?.code.endsWith('0000')){
                        return {
                            ...city,
                            name: `${province?.name || ''}${city?.name || ''}`
                        }
                    }

                    return city;
                }).map((x) => _.omit(x, 'children'));
                break;
            }
            case GB2260GRAN.COUNTY: {
                final = areaCodes.map((x) => this.gb2260.getCounty(x)).map((x) => _.omit(x, 'children'));
                break;
            }
            default: {
                break;
            }
        }

        return final;
    }


}
