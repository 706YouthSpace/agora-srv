
import { assignMeta, OperationNotAllowedError, ResourceNotFoundError, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { URL } from "url";
import _ from "lodash";
import { ObjectId } from "mongodb";

import { Pick, RPCMethod } from "./civi-rpc";
import { Event, EVENT_SENSOR_STATUS, MongoEvent } from "../db/event";
import { CURRENCY, MongoTransaction, Transaction, TRANSACTION_REASON, TRANSACTION_STATUS, WxSpecificTransactionDetails } from "../db/transaction";
import { MongoWxTemplateMsgSubscription } from "../db/wx-template-msg-subscription";
//import { DraftSiteForCreation, SITE_TYPE, wxGcj02LongitudeLatitude } from "./dto/site";
import { Pagination } from "./dto/pagination";
//import { wxTempMsgSub } from "./dto/wxTempMsgSub";
import { GB2260 } from "../lib/gb2260";
import { DraftEvent } from "./dto/event";
import { SignUp } from "./dto/signUp";
import { MongoUser, User } from "../db/user";
import { WxPayHTTPv3 as WxPayHTTP } from "../services/wechat/wx-pay-v3";
import { config, Config } from "../config";
import { MongoSite } from "../db/site";
import { Session } from "./dto/session";
import { EventTicket, MongoEventTicket, TICKET_STATUS } from "db/event-ticket";
import { WxService } from "../services/wechat/wx";
import { WxPayCreateTransactionDto } from "../services/wechat/dto/wx-pay-wxa";
//import { Context } from "koa";


// enum GB2260GRAN {
//     PROVINCE = 'province',
//     CITY = 'city',
//     COUNTY = 'county'
// }
@singleton()
export class EventRPCHost extends RPCHost {
    // wxPayHttp: WxPayHTTP = new WxPayHTTP({
    //     mchId: config.wechat.mchid,
    //     apiv3Key: config.wechat.apiv3Key,
    //     apiclientKeyDir: config.wechat.apiclientKeyDir,
    //     serialNumber: config.wechat.certSerial,
    //     platformCertificateFilePath: config.wechat.wxPayPlatformCertDir,
    //     platformCertificateSerial: config.wechat.wxPayPlatformCertSerial,
    // });

    constructor(
        protected mongoEvent: MongoEvent,
        protected mongoEventTicket: MongoEventTicket,
        protected mongoTransaction: MongoTransaction,
        protected mongoWxTemplateMsgSubscription: MongoWxTemplateMsgSubscription,
        protected gb2260: GB2260,
        protected mongoUser: MongoUser,
        protected mongoSite: MongoSite,
        protected config: Config,
        protected wxService: WxService,
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

    @RPCMethod('event.create')
    @RPCMethod('activity.create')
    async create(
        draft: DraftEvent,
        session: Session,
    ) {
        const user = await session.assertUser();

        const now = new Date();

        const site = await this.mongoSite.findOne({ _id: draft.site });

        if (!site) {
            throw new ResourceNotFoundError(`Referenced resource not found: site(${draft.site})`);
        }

        const event = Event.from<Event>({
            ...draft,
            creatorId: user._id,

            locationGB2260: site.locationGB2260,
            locationText: site.locationText,
            locationCoord: site.locationCoord,

            createdAt: now,
            updatedAt: now,
        });


        const r = await this.mongoEvent.create(event);
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
    @RPCMethod('event.list')
    @RPCMethod('activity.find')
    async find(
        pagination: Pagination,
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

        if (!longitude) {
            longitude = 0;
        }
        if (!latitude) {
            latitude = 0;
        }

        if (locationGB2260) {
            query.locationGB2260 = { $regex: new RegExp(`^${this.escapeRegExp(locationGB2260.trim().replace(/0+$/, ''))}`, 'gi') };
        }
        query.verified = auth ? 'draft' : 'passed';  // 临时注释，后面需去掉注释

        const result = await this.mongoEvent.collection.aggregate(
            [

                {
                    $geoNear: {
                        near: { type: "Point", coordinates: [longitude, latitude] },
                        spherical: true,
                        key: "locationCoord",
                        query: query,
                        distanceField: "calcDistance"
                    }
                },
                {
                    $lookup:
                    {
                        from: this.mongoSite.collectionName,
                        localField: "site",
                        foreignField: "_id",
                        as: "site_info"
                    }
                },
                { $match: query },
                { $unwind: "$site_info" },
                {
                    $addFields: {
                        isEnd:
                            { $lte: ["$endAt", "$$NOW"] }
                    }
                }
            ],
        ).skip(pagination.getSkip())
            .limit(pagination.getLimit())
            .toArray();  //  .sort({ updatedAt: -1 }) 

        pagination.setMeta(result);

        return result;
    }

    @RPCMethod('event.getParticipants')
    @RPCMethod('activity.applierDetail')
    async applierDetail(
        session: Session,
        @Pick('id') eventId: ObjectId
    ) {
        const user = await session.assertUser();
        const event = await this.mongoEvent.findOne({ _id: eventId });

        if (!event) {
            throw new ResourceNotFoundError(`Referenced resource not found: event(${eventId})`);
        }

        if (event.creatorId?.toHexString() !== user._id.toHexString()) {
            throw new OperationNotAllowedError(`Operation not allowed: event(${eventId})`);
        }

        const tickets = await this.mongoEventTicket.simpleFind({
            eventId,
            $or: [
                { paid: true },
                { needToPay: false }
            ]
        })

        const participants = await this.mongoUser.simpleFind({
            _id: { $in: tickets.map((t) => t.userId) }
        }, {
            projection: {
                nickName: true,
                realName: true,
                avatar: true,
                bio: true
            }
        })

        return { participants }
    }


    @RPCMethod('event.tickets')
    @RPCMethod('activity.signUpResult')
    async signUpResult(
        session: Session,
        @Pick('id') eventId?: ObjectId
    ) {
        const user = await session.assertUser();
        const query = {
            userId: user._id,
            eventId: eventId,
            // paid: 'Y'
        }
        if (!eventId) {
            delete query.eventId;
        }
        const tickets = await this.mongoEventTicket.simpleFind(query);

        const events = this.mongoEvent.simpleFind({
            _id: { $in: tickets.map((t) => t.eventId) }
        })

        assignMeta(tickets, { events });

        return tickets;
    }


    @RPCMethod('event.get')
    @RPCMethod('activity.get')
    async get(
        session: Session,
        @Pick('id', { required: true }) id: ObjectId,
    ) {
        await session.assertUser();
        const event = await this.mongoEvent.findOne({ _id: id });
        if (!event) {
            throw new ResourceNotFoundError(`Referenced resource not found: event(${id})`);
        }
        // const participants = await this.mongoSignUp.collection.find(query).toArray() ;
        const tickets = await this.mongoEventTicket.simpleFind({
            eventId: event._id,
            $or: [
                { paid: true },
                { needToPay: false }
            ]
        });
        const participants = await this.mongoUser.simpleFind({
            _id: { $in: tickets.map((t) => t.userId) }
        }, {
            projection: {
                nickName: true,
                realName: true,
                avatar: true,
                bio: true
            }
        });
        const site = await this.mongoSite.findOne({ _id: event.siteId });

        const creator = await this.mongoUser.findOne({ _id: event.creatorId });

        return {
            ...event,
            site,
            creator,
            participants,
        }
    }

    @RPCMethod('event.approve')
    @RPCMethod('activity.approve')
    async approve(
        @Pick('id') id: ObjectId,
        @Pick('approve') approved: boolean,
        session: Session,
    ) {
        const user = await session.assertUser();
        if (!user.isAdmin) {
            throw new OperationNotAllowedError(`Operation not allowed: user not admin`);
        }

        let event = await this.mongoEvent.findOne({ _id: id });
        if (!event) {
            throw new ResourceNotFoundError(`Referenced resource not found: event(${id})`);
        }

        event = await this.mongoEvent.updateOne({
            _id: id,
        }, { $set: { status: approved ? EVENT_SENSOR_STATUS.PASSED : EVENT_SENSOR_STATUS.REJECTED } });

        return event;
    }


    @RPCMethod('event.secureTicket')
    @RPCMethod('activity.submitSignUp')
    async submitSignUp(
        session: Session,
        @Pick('id', { required: true }) eventId: ObjectId,
        @Pick('wxTemplateMsgId') wxTempMsgId?: string,
    ) {
        const user = await session.assertUser();

        const event = await this.mongoEvent.findOne({ _id: eventId });

        if (!event) {
            throw new ResourceNotFoundError(`Referenced resource not found: event(${eventId})`);
        }

        const needToPay = (event.pricing || 0) > 0;

        const draftTicket = EventTicket.from<EventTicket>({
            userId: user._id,
            eventId: event._id,
            needToPay,

            status: needToPay ? TICKET_STATUS.PENDING_PAYMENT : TICKET_STATUS.VALID,

            wxAppId: this.config.get('wechat.appId'),
            wxNotifyTemplateId: wxTempMsgId
        });

        const ticket = await this.mongoEventTicket.create(draftTicket);


        return ticket;
    }

    @RPCMethod('ticket.pay')
    @RPCMethod('activity.askPay')
    async askPay(
        @Pick('ticketId') ticketId: ObjectId,
        session: Session
    ) {
        const user = await session.assertUser();

        const ticket = await this.mongoEventTicket.findOne({ _id: ticketId });
        if (!ticket) {
            throw new ResourceNotFoundError(`Referenced resource not found: ticket(${ticketId})`);
        }
        if (!ticket.userId.equals(user._id)) {
            throw new OperationNotAllowedError(`Operation not allowed: ticket.pay(${ticketId})`);
        }

        const event = await this.mongoEvent.findOne({ _id: ticket.eventId });
        if (!event) {
            throw new ResourceNotFoundError(`Referenced resource not found: event(${ticket.eventId})`);
        }

        if (!ticket.needToPay || !event.pricing || event.pricing <= 0) {
            const validTicket = this.mongoEventTicket.updateOne({ _id: ticketId }, { $set: { status: TICKET_STATUS.VALID } });

            return validTicket;
        }

        let transaction: Transaction | undefined;

        if (ticket.transactionId) {
            transaction = await this.mongoTransaction.findOne({ _id: ticket.transactionId });
            if (!transaction) {
                throw new ResourceNotFoundError(`Referenced resource not found: transaction(${ticket.transactionId})`);
            }
        } else {
            transaction = Transaction.from({
                title: `活动门票: ${event.title} - ${ticket._id}`,
                reason: TRANSACTION_REASON.EVENT_TICKET_PURCHASE,
                fromUserId: user._id,
                pricing: event.pricing,
                currencyType: CURRENCY.CNY,
                status: TRANSACTION_STATUS.CREATED
            });
            transaction = await this.mongoTransaction.create(transaction!);
        }

        this.wxService.createWxPayTransaction({
            description: transaction.title,
            out_trade_no: transaction._id.toHexString(),
            attach: transaction._id.toHexString(),
            amount: {
                total: event.pricing,
            }
        });

        const outTradeNo = Date.now().toString();
        const param = {
            appid: config.wechat.appId,
            mchid: config.wechat.mchid,
            description: signUpInfo[0].activities_info.title,
            out_trade_no: outTradeNo,
            notify_url: config.wechat.notifyUrl,
            amount: { total: signUpInfo[0].activities_info.pricing * 100 }, // 订单总金额，单位为分
            payer: { openid: openId }

        };
        console.log("signUpId: " + signUpId);

        let rslt = await this.wxPayHttp.execWxPay(param);//  this.wxPayHttp.createTransactionJSAPI(param);
        //console.log(rslt);

        const update = { outTradeNo: outTradeNo, wxPrepayId: rslt.data.prepay_id };
        await this.mongoSignUp.set(signUpId, update);

        // const authorization=rslt.config.headers.Authorization ;
        //let indexTime=authorization.indexOf("timestamp=");
        //let indexNonce=authorization.indexOf("nonce_str=");
        //let indexSign=authorization.indexOf("signature=");

        let rt = {
            timeStamp: Math.floor(Date.now() / 1000), // authorization.substr(indexTime+11,10),
            nonceStr: this.wxPayHttp.randomString(32),// authorization.substr(indexNonce+11,32),
            package: "prepay_id=" + rslt.data.prepay_id,
            signType: "RSA",
            paySign: "",
        };
        let strToSign = config.wechat.appId + '\n' +
            rt.timeStamp + '\n' +
            rt.nonceStr + '\n' +
            rt.package + '\n';
        // console.log("strToSign: ");
        // console.log(strToSign);
        let paySignStr = this.wxPayHttp.rsaSign(strToSign, config.wechat.apiclientKeyDir); // this.wxPayHttp.doSignShellCmd(strToSign,config.wechat.apiclientKeyDir);
        rt.paySign = paySignStr;
        console.log("rt: ");
        console.log(rt);
        return rt;
    }

    @RPCMethod('activity.paymentNotify')
    async paymentNotify(
        @Pick('event_type') event_type: string,
        @Pick('summary') summary: string

    ) {
        // console.log("event_type: "+event_type);
        // console.log("summary: "+summary);

        // console.log("associated_data: ");
        // console.log(resource.associated_data); 
        // console.log("nonce: ");
        // console.log(resource.nonce);
        // let decryptData=this.wxPayHttp.decryptAES_GCM(config.wechat.apiv3Key,resource.ciphertext,resource.associated_data); 
        // console.log("decryptData: ");
        // console.log(decryptData);
        if ("TRANSACTION.SUCCESS" === event_type) {
            // let payResult:any={}; 
            // payResult.wxPaidTimeEnd =time_end!=undefined?time_end:"" ;
            // payResult.outTradeNo = out_trade_no!=undefined?out_trade_no:"";
            // payResult.wxTransactionId = transaction_id!=undefined?transaction_id:"";
            // payResult.wxReturnCode = return_code!=undefined?return_code:"";
            // payResult.wxResultCode = result_code!=undefined?result_code:"";

            // //let payResult={wxReturnCode:return_code, wxReturnMsg: return_msg };
            // await this.mongoSignUp.collection.updateOne(
            //     { "outTradeNo" : payResult.outTradeNo }, // specifies the document to update
            //     {
            //       $set: payResult
            //     }
            // ) ;

            let backWx = {
                "code": event_type,
                "message": summary
            };
            return backWx;
        } else {
            let errResult = {
                "code": event_type,
                "message": summary
            };
            return errResult;
        }

    }

    @RPCMethod('activity.orderQuery')
    async orderQuery(
        @Pick('signUpId') signUpId: ObjectId,
        sessionUser: SessionUser
    ) {
        await sessionUser.assertUser();
        const rtn: any = {};
        const payResult = await this.mongoSignUp.get(signUpId) as any;
        if (payResult.wxReturnCode === undefined || payResult.wxReturnCode === null || payResult.wxReturnCode === "") {
            // https://api.mch.weixin.qq.com/pay/orderquery 

            return rtn;
        } else {
            rtn.wxPaidTimeEnd = payResult.wxPaidTimeEnd;
            rtn.outTradeNo = payResult.outTradeNo;
            rtn.wxTransactionId = payResult.wxTransactionId;
            rtn.wxReturnCode = payResult.wxReturnCode;
            rtn.wxResultCode = payResult.wxResultCode;
            rtn.wxErrCode = payResult.wxErrCode;
            rtn.wxErrCodeDes = payResult.wxErrCodeDes;

            return rtn;
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
