import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick,RPCMethod } from "./civi-rpc";
import { MongoActivities } from "../db/activity";
//import { DraftSiteForCreation, SITE_TYPE, wxGcj02LongitudeLatitude } from "./dto/site";
import { ObjectId } from "bson";
import { URL } from "url";
import { Pagination } from "./dto/pagination";
import { GB2260 } from "../lib/gb2260";
import { DraftActivityForCreation } from "./dto/activity";

// enum GB2260GRAN {
//     PROVINCE = 'province',
//     CITY = 'city',
//     COUNTY = 'county'
// }


@singleton()
export class ActivityRPCHost extends RPCHost {

    constructor(
        protected mongoActivity: MongoActivities,
        protected gb2260: GB2260
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

    @RPCMethod('activity.create')
    async create(draft: DraftActivityForCreation) {

        const draftActivity = {
            title: draft.title,
            subtitle: draft.subtitle,
            detail: draft.detail,
            type: draft.type,

            tags: draft.tags,
            image: draft.image, // this.convertURLOrObjId(draft.image),
            images: draft.images, // draft.images?.map((x) => this.convertURLOrObjId(x)!).filter(Boolean),
            
            site: draft.site,
            // host: draft.host,
            participantCap: draft.participantCap,
            pricing: draft.pricing,
            collectFromParticipants: draft.collectFromParticipants,
            qrImage: draft.qrImage,
            startAt: draft.startAt,
            endAt: draft.endAt,
            verified: draft.verified,

            locationGB2260: draft.locationGB2260,
            locationText: draft.locationText,
            locationCoord: draft.locationCoord
        }

        const r = await this.mongoActivity.create(draftActivity);

        return r;
    }

    /*{  pageSize:   
        pageIndex: 从1开始  
        *tag: 类型 [线上、科技、教育、哲学、艺术]  
        *locationGB2260: 所在城市  
        *latitude: 用户纬度  
        *longitude: 用户经度}
    */
    @RPCMethod('activity.find')
    async find( pagination: Pagination,
        @Pick('latitude') latitude?: number,
        @Pick('longitude') longitude?: number,
        @Pick('locationGB2260') locationGB2260?: string,
        @Pick('tag', { arrayOf: String }) tag?: string[] ) {

            const query: any = {};

            if (tag) {
                query.tags = { $in: tag };
            }
    
           if(longitude && latitude){
                query.locationCoord=[longitude , latitude];
           }
    
            if (locationGB2260) {
                query.locationGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locationGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
            }
    
            const result = await this.mongoActivity.collection.find(query)
                                                                .sort({ updatedAt: -1 })
                                                                .skip(pagination.getSkip())
                                                                .limit(pagination.getLimit())
                                                                .toArray();
    
            pagination.setMeta(result);
    
            return result;
    }

    @RPCMethod('activity.get')
    async get(
        @Pick('id') id: ObjectId
    ) {
        const result = await this.mongoActivity.get(id);

        return result;
    }

    // @RPCMethod('site.find')
    // async find(
    //     pagination: Pagination,
    //     @Pick('name') name?: string,
    //     @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
    //     @Pick('location') locationText?: string,
    //     @Pick('locationGB2260') locationGB2260?: string,
    //     @Pick('locationNear', { arrayOf: Number, validateArray: wxGcj02LongitudeLatitude })
    //     locationNear?: [number, number],
    //     @Pick('distance', { arrayOf: Number, validate: (x: number) => x > 0 })
    //     distance?: number,
    //     @Pick('tags', { arrayOf: String }) tags?: string[]
    // ) {
    //     const query: any = {};

    //     if (name) {
    //         query.name = { $regex: new RegExp(`.*${this.escapeRegExp(name)}.*`, 'gi') };
    //     }

    //     if (type) {
    //         query.type = { $in: type };
    //     }

    //     if (tags) {
    //         query.tags = { $in: tags };
    //     }

    //     if (locationText) {
    //         query.locationText = { $regex: new RegExp(`.*${this.escapeRegExp(locationText)}.*`, 'gi') };
    //     }

    //     if (locationGB2260) {
    //         query.locationGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locationGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
    //     }

    //     if (locationNear && distance) {
    //         query.locationCoord = {
    //             $nearSphere: {
    //                 $geometry: {
    //                     type: 'Point',
    //                     coordinates: locationNear,
    //                 },
    //                 $maxDistance: distance
    //             }
    //         }
    //     }

    //     if (pagination.getAnchor()) {
    //         query.updatedAt = { $lt: pagination.getAnchor() };
    //     }
    //     const result = await this.mongoSite.collection.find(query)
    //         .sort({ updatedAt: -1 })
    //         .skip(pagination.getSkip())
    //         .limit(pagination.getLimit())
    //         .toArray();

    //     pagination.setMeta(result);

    //     return result;
    // }

    // @RPCMethod('site.get')
    // async get(
    //     @Pick('id') id: ObjectId
    // ) {
    //     const result = await this.mongoSite.get(id);

    //     return result;
    // }

    // @RPCMethod('site.gb2260.get')
    // async getGB2260(
    //     @Pick('granularity', { type: GB2260GRAN, default: GB2260GRAN.CITY }) gb2260Granularity: GB2260GRAN,
    //     @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
    // ) {
    //     const query: any = {};

    //     if (type) {
    //         query.type = { $in: type };
    //     }

    //     let gb2260SubstrLength = 4;

    //     switch (gb2260Granularity) {
    //         case GB2260GRAN.PROVINCE: {
    //             gb2260SubstrLength = 2;
    //             break;
    //         }
    //         case GB2260GRAN.CITY: {
    //             gb2260SubstrLength = 4;
    //             break;
    //         }
    //         case GB2260GRAN.COUNTY: {
    //             gb2260SubstrLength = 6;
    //             break;
    //         }
    //         default: {
    //             break;
    //         }
    //     }

    //     const r = await this.mongoSite.collection.aggregate<{ _id: string }>([
    //         { $match: query },
    //         {
    //             $group: {
    //                 _id: { $substrBytes: ['$locationGB2260', 0, gb2260SubstrLength] }
    //             }
    //         },
    //     ]).toArray();

    //     const zeros = '000000';
    //     const areaCodes = r.filter((x) => x._id).map((x) => x._id + zeros.substring(0, 6 - x._id.length));

    //     let final;

    //     switch (gb2260Granularity) {
    //         case GB2260GRAN.PROVINCE: {
    //             final = areaCodes.map((x) => this.gb2260.getProvince(x)).map((x) => _.omit(x, 'children'));
    //             break;
    //         }
    //         case GB2260GRAN.CITY: {
    //             final = areaCodes.map((x) => this.gb2260.getCity(x)).map((x) => _.omit(x, 'children'));
    //             break;
    //         }
    //         case GB2260GRAN.COUNTY: {
    //             final = areaCodes.map((x) => this.gb2260.getCounty(x)).map((x) => _.omit(x, 'children'));
    //             break;
    //         }
    //         default: {
    //             break;
    //         }
    //     }

    //     return final;
    // }


}
