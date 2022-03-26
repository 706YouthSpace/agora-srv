import { OperationNotAllowedError, RequestedEntityNotFoundError, ResourceNotFoundError, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { ObjectId } from "bson";
import { URL } from "url";
import _ from "lodash";

import { Pick, RPCMethod } from "./civi-rpc";
import { MongoSite, Site, SITE_TYPE } from "../db/site";
import { MongoEvent, EVENT_STATUS, Event } from "../db/event";
import { DraftSite, DraftSiteForCreation, wxGcj02LongitudeLatitude } from "./dto/site";
import { Pagination } from "./dto/pagination";
import { GB2260 } from "../lib/gb2260";
import { MongoUser, User } from "../db/user";
import { AMapHTTP } from "../services/amap";
import { Config } from "../config";
import { Session } from "./dto/session";

enum GB2260GRAN {
    COUNTRY = 'country',
    PROVINCE = 'province',
    CITY = 'city',
    COUNTY = 'county'
}

@singleton()
export class SiteRPCHost extends RPCHost {

    aMapRPC!: AMapHTTP;

    constructor(
        protected mongoSite: MongoSite,
        protected gb2260: GB2260,
        protected mongoEvent: MongoEvent,
        protected mongoUser: MongoUser,
        protected config: Config
    ) {
        super(...arguments);

        this.init();
    }

    async init() {
        await this.dependencyReady();

        this.aMapRPC = new AMapHTTP({
            key: this.config.get('amap.key'),
            secret: this.config.get('amap.secret')
        });

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
    async create(session: Session, draft: DraftSiteForCreation) {
        const user = await session.assertUser();
        if (draft.locationCoord) {
            const location = await this.aMapRPC.regeo(draft.locationCoord);
            if (!draft.locationText) {
                draft.locationText = location.regeocode.formatted_address!;
            };
            (draft as any).locationProps = {
                ..._.pick(location.regeocode.addressComponent, ['country', 'province', 'city', 'district']),
                town: location.regeocode.addressComponent.township
            }
            if (!draft.locationGB2260) {
                draft.locationGB2260 = location.regeocode.addressComponent.adcode;
            }
        }
        const site = Site.from<Site>({ ...draft, creator: user._id });

        const r = await this.mongoSite.create(site);

        return r;
    }

    @RPCMethod('site.update')
    async update(
        session: Session,
        @Pick('_id') id: ObjectId,
        draft: DraftSite
    ) {
        const user = await session.assertUser();
        const origSite = await this.mongoSite.findOne({ _id: id });
        if (!origSite) {
            throw new ResourceNotFoundError(`Site ${id} not found`);
        }
        if (!user._id.equals(origSite.creator || '') && !user.isAdmin) {
            throw new OperationNotAllowedError(`Only creator or admin can do site.update`);
        }
        const coord = draft.locationCoord || origSite.locationCoord;
        if (coord) {
            const location = await this.aMapRPC.regeo(coord);
            if (!draft.locationText) {
                draft.locationText = location.regeocode.formatted_address!;
            };
            (draft as any).locationProps = {
                ..._.pick(location.regeocode.addressComponent, ['country', 'province', 'city', 'district']),
                town: location.regeocode.addressComponent.township
            }
            if (!draft.locationGB2260) {
                draft.locationGB2260 = location.regeocode.addressComponent.adcode;
            }
        }
        const site = Site.from<Site>({ ...origSite, ...draft, updatedAt: new Date() });

        const r = await this.mongoSite.save(site);

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

        const result = await this.mongoSite.collection.find(query)
            .sort({ updatedAt: -1 })
            .skip(pagination.getSkip())
            .limit(pagination.getLimit())
            .toArray();

        const sitesMapped = await Promise.all(result.map((x) => Site.from<Site>(x).toTransferDto()));

        pagination.setMeta(result);

        return sitesMapped;
    }

    @RPCMethod('site.get')
    async get(
        @Pick('id') id: ObjectId
    ) {
        const siteMongo = await this.mongoSite.get(id) as Site;

        if (!siteMongo) {
            throw new RequestedEntityNotFoundError(`Site with id ${id} not found`);
        }

        const site = await Site.from<Site>(siteMongo).toTransferDto();

        const eventQuery = {
            site: site._id,
            status: EVENT_STATUS.PASSED
        }
        
        const events = await this.mongoEvent.simpleFind(eventQuery, {
            sort: { createdAt: -1 },
            limit: 20
        });

        const mapped = Promise.all(events.map((x) => Event.from<Event>(x).toTransferDto()));

        

        const creator = site.creator ? await this.mongoUser.get(site.creator) : undefined;

        return {
            ...site,
            events: mapped,
            activities: mapped,
            creator: creator ? User.from<User>(creator).toTransferDto() : undefined
        };
    }

    @RPCMethod('site.listLocationAdm')
    async getGB2260(
        @Pick('granularity', { type: GB2260GRAN, default: GB2260GRAN.CITY }) gb2260Granularity: GB2260GRAN,
        @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
    ) {
        const query: any = {};

        if (type) {
            query.type = { $in: type };
        }

        let groupBy: any = {

        };
        let trimZeros = 2;
        switch (gb2260Granularity) {
            case GB2260GRAN.PROVINCE: {
                groupBy.country = `$locationProps.country`;
                groupBy.province = `$locationProps.province`;
                trimZeros = 4;
                break;
            }
            case GB2260GRAN.CITY: {
                groupBy.country = `$locationProps.country`;
                groupBy.province = `$locationProps.province`;
                groupBy.city = `$locationProps.city`;
                trimZeros = 2;
                break;
            }
            case GB2260GRAN.COUNTY: {

                groupBy.country = `$locationProps.country`;
                groupBy.province = `$locationProps.province`;
                groupBy.city = `$locationProps.city`;
                groupBy.district = `$locationProps.district`;
                trimZeros = 0;
                break;
            }
            default: {
                break;
            }
        }

        const r = await this.mongoSite.collection.aggregate<any>([
            { $match: query },
            {
                $group: {
                    _id: groupBy,
                    locationGB2260: { $first: '$locationGB2260' }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]).toArray();

        const final = r.filter((x) => x._id?.country && x._id?.province).map((x) => {

            const name = `${x._id.province || ''}${(x._id.city === x._id.province ? '' : x._id.city) || ''}${x._id.district || ''}`

            return { name: name, code: x.locationGB2260?.replace(new RegExp(`\\d{${trimZeros}}$`), '000000').slice(0, 6) }
        }).filter((x) => x.name);

        return final;
    }


}
