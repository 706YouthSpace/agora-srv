
import { RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick,RPCMethod } from "./civi-rpc";
import { Activity, MongoActivities } from "../db/activity";
import { MongoSignUp } from "../db/signUp";
import { MongoWxTempMsgSub } from "../db/wxTempMsgSub";
//import { DraftSiteForCreation, SITE_TYPE, wxGcj02LongitudeLatitude } from "./dto/site";
import { ObjectId } from "bson";
import { URL } from "url";
import { Pagination } from "./dto/pagination";
//import { wxTempMsgSub } from "./dto/wxTempMsgSub";
import { GB2260 } from "../lib/gb2260";
import { DraftActivityForCreation, VERIFIED_STATUS } from "./dto/activity";
import { SignUp } from "./dto/signUp";
import { SessionUser } from "./dto/user";
import { MongoUser, User } from "../db/user";
import {WxPayHTTP } from "../services/wechat/wx-pay-v2";
import { config } from "../config";
import { MongoSite } from "../db/site";

// enum GB2260GRAN {
//     PROVINCE = 'province',
//     CITY = 'city',
//     COUNTY = 'county'
// }
@singleton()
export class ActivityRPCHost extends RPCHost {
    wxPayHttp:WxPayHTTP=new WxPayHTTP({ rsa2048PrivateKey: config.wechat.aesEncryptionKey ,
                                        apiv3Key: config.wechat.appSecret}); //待调整
    constructor(
        protected mongoActivity: MongoActivities,
        protected mongoSignUp: MongoSignUp,
        protected mongoWxTempMsgSub: MongoWxTempMsgSub,
        protected gb2260: GB2260,
        protected mongoUser: MongoUser,
        protected mongoSite: MongoSite
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
    async create(
        draft: DraftActivityForCreation,
        sessionUser: SessionUser,
    ) {
        const userId = await sessionUser.assertUser();
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
            locationCoord: draft.locationCoord,
            creator: userId ,
            templateId:""
        }

        const site = await this.mongoSite.collection.findOne(draft.site as ObjectId) as any
        draftActivity.locationGB2260 = site.locationGB2260
        draftActivity.locationText = site.locationText
        draftActivity.locationCoord = site.locationCoord

        //console.log(draft);
        if(draft.templateId!=undefined  && draft.templateId.length>0){
            draftActivity.templateId=draft.templateId[0];
        }
        const r = await this.mongoActivity.create(draftActivity);
        this.mongoActivity.collection.createIndex( { locationCoord : "2dsphere" } )
        // 若活动创建成功，还需给管理员发短信，通知他来审核。。。
        return r;
    }
    /*{  pageSize:   
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
        @Pick('tag', { arrayOf: String }) tag?: string[],
        @Pick('auth') auth?: boolean,
   ) {
            const query: any = {};
            if (tag) {
                query.tags = { $in: tag };
            }
    
           if(!longitude){
                longitude=0;
           }
           if(!latitude){
                latitude=0;
           }
    
            if (locationGB2260) {
                query.locationGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locationGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
            }
            query.verified = auth ? 'draft' : 'passed' ;  // 临时注释，后面需去掉注释
            // query.locationCoord={
            //         $nearSphere:{
            //             $geometry:{
            //                 type:"Point",
            //                 coordinates:[longitude , latitude]
            //                 }
            //             }
            //         };
    
            // const result = await this.mongoActivity.collection.find(query)
                                                                // .sort({ updatedAt: -1 })
                                                                // .skip(pagination.getSkip())
                                                                // .limit(pagination.getLimit())
                                                                // .toArray();
            const result = await this.mongoActivity.collection.aggregate(
                    [
                        
                        {
                            $geoNear: {
                               near:{ type: "Point", coordinates:  [longitude , latitude]} ,
                               spherical: true,
                               key: "locationCoord",
                               query: query,
                               distanceField: "calcDistance"
                            }
                         },
                         {
                            $lookup:
                               {
                                  from: "sites",
                                  localField: "site",
                                  foreignField: "_id",
                                  as: "site_info"
                              }
                         },
                        { $match: query },
                        { $unwind: "$site_info" },
                        {
                            $addFields: { isEnd:
                                { $lte: [ "$endAt", "$$NOW" ] } }
                        }
                    ]
            ).skip(pagination.getSkip())
            .limit(pagination.getLimit())
            .toArray();  //  .sort({ updatedAt: -1 }) 
    
            pagination.setMeta(result);
    
            return result;
    }
    @RPCMethod('activity.applierDetail') 
    async applierDetail(
        sessionUser: SessionUser,
        @Pick('activityId') activityId: ObjectId
    ) {
        const userId = await sessionUser.assertUser();
        const act = await this.mongoActivity.collection.findOne(activityId)
        if (!act || act.creator.toHexString() !== userId.toHexString()) {
            return false
        }
        const query = {
            activityId: activityId , // { $in: activityId }; 
            paid: 'Y'
        }
        const participants = await this.mongoSignUp.collection.aggregate([
            {
               $lookup:
                  {
                     from: "users",
                     localField: "userId",
                     foreignField: "_id",
                     as: "user_info"
                 }
            },
            { $match: query },
            {
                $project:
                    {
                        avatarUrl: { $arrayElemAt: ['$user_info.avatarUrl', 0] },
                        nickName: { $arrayElemAt: ['$user_info.nickName', 0] },
                        userId: { $arrayElemAt: ['$user_info._id', 0] },
                        info: 1,
                    }
            }
            // { $unwind: "$user_info" },
         ]).toArray();
         return {participants}
    }
    @RPCMethod('activity.signUpResult') 
    async signUpResult(
        sessionUser: SessionUser,
        @Pick('activityId') activityId: ObjectId
    ) {
        const userId = await sessionUser.assertUser();
        const query = {
            userId,
            activityId: activityId,
            // paid: 'Y'
        }
        const item = await this.mongoSignUp.collection.findOne(query)
        if (item) {
            const queryActivity: any = {};
            queryActivity._id = activityId;
            const resultData = await this.mongoActivity.collection.aggregate(
                [
                    {
                       $lookup:
                          {
                             from: "sites",
                             localField: "site",
                             foreignField: "_id",
                             as: "site_info"
                         }
                    },
                    { $match: queryActivity },
                    { $unwind: "$site_info" },
                 ]
            ).next() as Activity; 
            return resultData
        }
        return {a: "1"}
    }
    @RPCMethod('activity.get')
    async get(
        @Pick('id') id: ObjectId,
        sessionUser: SessionUser,
    ) {
        const query: any = {};
        const userId = await sessionUser.assertUser();
        query.activityId = id ; // { $in: activityId }; 
        query.paid = 'Y'
        // const participants = await this.mongoSignUp.collection.find(query).toArray() ;
        const participants = await this.mongoSignUp.collection.aggregate([
            {
               $lookup:
                  {
                     from: "users",
                     localField: "userId",
                     foreignField: "_id",
                     as: "user_info"
                 }
            },
            { $match: query },
            {
                $project:
                    {
                        avatarUrl: { $arrayElemAt: ['$user_info.avatarUrl', 0] },
                        nickName: { $arrayElemAt: ['$user_info.nickName', 0] },
                        userId: { $arrayElemAt: ['$user_info._id', 0] },
                    }
            }
            // { $unwind: "$user_info" },
         ]).toArray() ;
        //const resultData = await this.mongoActivity.get(id) as Activity;
        const queryActivity: any = {};
        queryActivity._id = id ;
        const resultData = await this.mongoActivity.collection.aggregate(
            [
                {
                   $lookup:
                      {
                         from: "sites",
                         localField: "site",
                         foreignField: "_id",
                         as: "site_info"
                     }
                },
                { $match: queryActivity },
                { $unwind: "$site_info" },
                {
                    $addFields: { isEnd:
                        { $lte: [ "$endAt", "$$NOW" ] },
                     }
                }
             ]
        ).next() as Activity;
        const creator = resultData.creator && await this.mongoUser.get(resultData.creator)
        const isJoined = userId && participants.some(item => {
            return item.userId.toHexString() === userId.toHexString()
        })
        const result = Object.assign(resultData, {
            participants,
            creator,
            isJoined
        })
        return result;
    }
    @RPCMethod('activity.approve')
    async approve(
        @Pick('id') id: ObjectId,
        @Pick('approve') approve: boolean,
        sessionUser: SessionUser,
    ) {
        const userId = await sessionUser.assertUser();
        const user = await this.mongoUser.get(userId) as User;
        if (!user.isAdmin) {
            return false
        }

        const result = await this.mongoActivity.get(id) as Activity;
        const verified = approve ? VERIFIED_STATUS.PASSED : VERIFIED_STATUS.REJECTED
        const data = await this.mongoActivity.set(result._id, {verified})
        return data;
    }


    @RPCMethod('activity.submitSignUp')
    async submitSignUp(
        sessionUser: SessionUser,
        draft: SignUp
        ) {
        const userId = await sessionUser.assertUser();
        const user = await this.mongoUser.get(userId) as any;
        const openId= Object.values(user.wxOpenId)[0] as string;
    console.log(draft);

        const activity = await this.mongoActivity.collection.findOne(draft.activityId as ObjectId) as Activity
        console.log(activity)
        const needToPay =  activity.pricing === 0 ? "N" : "Y"

        const draftSignUp = {
            userId: userId,
            activityId: draft.activityId,
            info: activity.info,
            paid: needToPay === "Y" ? "N" : "Y",
            needToPay,
            toUserName: config.wechat.appId,
            fromUserName:openId ,
            createTime: activity.createAt,
            templateId: draft.templateId,
            subscribeStatusString: "accept",
            sent: "N",
        }
        const r = await this.mongoSignUp.create(draftSignUp);
        return Object.assign(r, { needToPay });
    }

    @RPCMethod('activity.askPay')
    async askPay(
        @Pick('signUpId') signUpId: ObjectId,
        sessionUser: SessionUser
    ) {
        const userId = await sessionUser.assertUser();
        const user = await this.mongoUser.get(userId) as any;
        const openId= Object.values(user.wxOpenId)[0] as string;

        let query={_id: signUpId }; 
        const signUpInfo = await this.mongoSignUp.collection.aggregate(
            [
                {
                   $lookup:
                      {
                         from: "activities",
                         localField: "activityId",
                         foreignField: "_id",
                         as: "activities_info"
                     }
                },
                { $match: query },
                { $unwind: "$activities_info" },
                
             ]
        ).toArray() as any;

        const outTradeNo=Date.now().toString() ;
        const param={
            appid: config.wechat.appId,
            mchid: config.wechat.mchid,
            description: signUpInfo[0].activities_info.title,
            out_trade_no: outTradeNo ,
            notify_url: config.wechat.notifyUrl,
            amount: {total:signUpInfo[0].activities_info.pricing *100 }, // 订单总金额，单位为分
            payer: {openid: openId}

        } ;
        console.log(signUpId);

        let data=await this.wxPayHttp.createTransactionJSAPI(param);
        console.log(data);

        const update = {outTradeNo:outTradeNo ,wxPrepayId:data.prepay_id };
        await this.mongoSignUp.set(signUpId,update) ;
       
        return data;
    }

    @RPCMethod('activity.paymentNotify')
    async paymentNotify(
        @Pick('return_code') return_code: string,
        @Pick('return_msg') return_msg?: string,
        @Pick('result_code') result_code?: string,
        @Pick('err_code') err_code?: string,
        @Pick('err_code_des') err_code_des?: string,
        @Pick('transaction_id') transaction_id?: string,
        @Pick('out_trade_no') out_trade_no?: string,
        @Pick('time_end') time_end?: string
    ) {
        
        if("SUCCESS"===return_code){
            let payResult:any={}; 
            payResult.wxPaidTimeEnd =time_end!=undefined?time_end:"" ;
            payResult.outTradeNo = out_trade_no!=undefined?out_trade_no:"";
            payResult.wxTransactionId = transaction_id!=undefined?transaction_id:"";
            payResult.wxReturnCode = return_code!=undefined?return_code:"";
            payResult.wxResultCode = result_code!=undefined?result_code:"";;
            if("SUCCESS"===result_code){
            }else{
                payResult.wxErrCode =err_code!=undefined?err_code:"" ;
                payResult.wxErrCodeDes =err_code_des!=undefined?err_code_des:"" ;
            }

            //let payResult={wxReturnCode:return_code, wxReturnMsg: return_msg };
            await this.mongoSignUp.collection.updateOne(
                { "outTradeNo" : payResult.outTradeNo }, // specifies the document to update
                {
                  $set: payResult
                }
            ) ;

            let backWx={return_code:return_code };
            return backWx ;
        }else{
            let errResult={return_code:return_code, return_msg: return_msg };
            return errResult ;
        }

    }

    @RPCMethod('activity.orderQuery')
    async orderQuery(
        @Pick('signUpId') signUpId: ObjectId,
        sessionUser: SessionUser
    ) {
         await sessionUser.assertUser();
         const rtn:any={};
        const payResult=await this.mongoSignUp.get(signUpId) as any ;
        if(payResult.wxReturnCode===undefined || payResult.wxReturnCode===null || payResult.wxReturnCode===""){
            // https://api.mch.weixin.qq.com/pay/orderquery 

            return rtn ;
        }else{
            rtn.wxPaidTimeEnd=payResult.wxPaidTimeEnd;
            rtn.outTradeNo=payResult.outTradeNo;
            rtn.wxTransactionId=payResult.wxTransactionId;
            rtn.wxReturnCode=payResult.wxReturnCode;
            rtn.wxResultCode=payResult.wxResultCode;
            rtn.wxErrCode=payResult.wxErrCode;
            rtn.wxErrCodeDes=payResult.wxErrCodeDes;

            return rtn ;
        }

    }

    // @RPCMethod('activity.wxTempMsgSub')
    // async wxTempMsgSub(
    //     draft: wxTempMsgSub) {
    //     if("subscribe_msg_popup_event"!=draft.Event){
    //         return ;
    //     }
    //     const draftWxTempMsgSub = {
    //         ToUserName: draft.ToUserName,
    //         FromUserName: draft.FromUserName,
    //         CreateTime: draft.CreateTime,
    //         TemplateId: draft.SubscribeMsgPopupEvent[0].TemplateId,
    //         SubscribeStatusString: draft.SubscribeMsgPopupEvent[0].SubscribeStatusString,
    //         Sent: "N"
    //     }
    //     await this.mongoWxTempMsgSub.create(draftWxTempMsgSub);
    //     return ;
    // }

    // @RPCMethod('site.find')
    // async find(
    //     pagination: Pagination,
    //     @Pick('name') name?: string,
    //     @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
    //     @Pick('location') locationText?: string,
    //     @Pick('locationGB2260') locationGB2260?: string,
    //     @Pick('locationNear', { arrayOf: Number, validateArray: wxGcj02LongitudeLatitude })
    //     locationNear?: [number, number],
    //     @Pick('distance', { arrayOf: Number, validate: (x: number) => x > 0 })
    //     distance?: number,
    //     @Pick('tags', { arrayOf: String }) tags?: string[]
    // ) {
    //     const query: any = {};
    //     if (name) {
    //         query.name = { $regex: new RegExp(`.*${this.escapeRegExp(name)}.*`, 'gi') };
    //     }
    //     if (type) {
    //         query.type = { $in: type };
    //     }
    //     if (tags) {
    //         query.tags = { $in: tags };
    //     }
    //     if (locationText) {
    //         query.locationText = { $regex: new RegExp(`.*${this.escapeRegExp(locationText)}.*`, 'gi') };
    //     }
    //     if (locationGB2260) {
    //         query.locationGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locationGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
    //     }
    //     if (locationNear && distance) {
    //         query.locationCoord = {
    //             $nearSphere: {
    //                 $geometry: {
    //                     type: 'Point',
    //                     coordinates: locationNear,
    //                 },
    //                 $maxDistance: distance
    //             }
    //         }
    //     }
    //     if (pagination.getAnchor()) {
    //         query.updatedAt = { $lt: pagination.getAnchor() };
    //     }
    //     const result = await this.mongoSite.collection.find(query)
    //         .sort({ updatedAt: -1 })
    //         .skip(pagination.getSkip())
    //         .limit(pagination.getLimit())
    //         .toArray();
    //     pagination.setMeta(result);
    //     return result;
    // }
    // @RPCMethod('site.get')
    // async get(
    //     @Pick('id') id: ObjectId
    // ) {
    //     const result = await this.mongoSite.get(id);
    //     return result;
    // }
    // @RPCMethod('site.gb2260.get')
    // async getGB2260(
    //     @Pick('granularity', { type: GB2260GRAN, default: GB2260GRAN.CITY }) gb2260Granularity: GB2260GRAN,
    //     @Pick('type', { arrayOf: SITE_TYPE }) type?: SITE_TYPE[],
    // ) {
    //     const query: any = {};
    //     if (type) {
    //         query.type = { $in: type };
    //     }
    //     let gb2260SubstrLength = 4;
    //     switch (gb2260Granularity) {
    //         case GB2260GRAN.PROVINCE: {
    //             gb2260SubstrLength = 2;
    //             break;
    //         }
    //         case GB2260GRAN.CITY: {
    //             gb2260SubstrLength = 4;
    //             break;
    //         }
    //         case GB2260GRAN.COUNTY: {
    //             gb2260SubstrLength = 6;
    //             break;
    //         }
    //         default: {
    //             break;
    //         }
    //     }
    //     const r = await this.mongoSite.collection.aggregate<{ _id: string }>([
    //         { $match: query },
    //         {
    //             $group: {
    //                 _id: { $substrBytes: ['$locationGB2260', 0, gb2260SubstrLength] }
    //             }
    //         },
    //     ]).toArray();
    //     const zeros = '000000';
    //     const areaCodes = r.filter((x) => x._id).map((x) => x._id + zeros.substring(0, 6 - x._id.length));
    //     let final;
    //     switch (gb2260Granularity) {
    //         case GB2260GRAN.PROVINCE: {
    //             final = areaCodes.map((x) => this.gb2260.getProvince(x)).map((x) => _.omit(x, 'children'));
    //             break;
    //         }
    //         case GB2260GRAN.CITY: {
    //             final = areaCodes.map((x) => this.gb2260.getCity(x)).map((x) => _.omit(x, 'children'));
    //             break;
    //         }
    //         case GB2260GRAN.COUNTY: {
    //             final = areaCodes.map((x) => this.gb2260.getCounty(x)).map((x) => _.omit(x, 'children'));
    //             break;
    //         }
    //         default: {
    //             break;
    //         }
    //     }
    //     return final;
    }