import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick, RPCMethod } from "./civi-rpc";
import { MongoSite } from "../db/site";
import { DraftSiteForCreation, SITE_TYPE, wxGcj02LongitudeLatitude } from "./dto/site";
import { ObjectId } from "bson";
import { URL } from "url";
import { Pagination } from "./dto/pagination";

@singleton()
export class SiteRPCHost extends RPCHost {

    constructor(
        protected mongoSite: MongoSite
    ) {
        super(...arguments);
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

        const draftSite = {
            name: draft.name,
            type: draft.type,

            image: this.convertURLOrObjId(draft.image),

            images: draft.images?.map((x) => this.convertURLOrObjId(x)!).filter(Boolean),

            locationText: draft.locationText,
            locationCoord: draft.locationCoord
        }

        const r = await this.mongoSite.create(draftSite);

        return r;
    }

    @RPCMethod('site.find')
    async find(
        pagination: Pagination,
        @Pick('name') name?: string,
        @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
        @Pick('location') locaitonText?: string,
        @Pick('locationGB2260') locaitonGB2260?: string,
        @Pick('locationNear', { arrayOf: Number, validate: wxGcj02LongitudeLatitude })
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

        if (locaitonText) {
            query.locationText = { $regex: new RegExp(`.*${this.escapeRegExp(locaitonText)}.*`, 'gi') };
        }

        if (locaitonGB2260) {
            query.locaitonGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locaitonGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
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
        const result = await this.mongoSite.get(id);

        return result;
    }

}
