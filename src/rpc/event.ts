
import { assignMeta, OperationNotAllowedError, ResourceNotFoundError, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { URL } from "url";
import _ from "lodash";
import { ObjectId } from "mongodb";
import moment from 'moment';

import { Pick, RPCMethod } from "./civi-rpc/civi-rpc";
import { Event, EVENT_SENSOR_STATUS, MongoEvent } from "../db/event";
import { CURRENCY, mapWxTradeStateToTransactionProgress, mapWxTransactionProgressToTransactionStatus, MongoTransaction, Transaction, TRANSACTION_PROGRESS, TRANSACTION_REASON, TRANSACTION_STATUS } from "../db/transaction";
import { MongoWxTemplateMsgSubscription } from "../db/wx-template-msg-subscription";
//import { DraftSiteForCreation, SITE_TYPE, wxGcj02LongitudeLatitude } from "./dto/site";
import { Pagination } from "./dto/pagination";
//import { wxTempMsgSub } from "./dto/wxTempMsgSub";
import { GB2260 } from "../lib/gb2260";
import { DraftEvent } from "./dto/event";
import { MongoUser, User } from "../db/user";
import { Config } from "../config";
import { MongoSite, Site } from "../db/site";
import { Session } from "./dto/session";
import { EventTicket, MongoEventTicket, TICKET_STATUS } from "../db/event-ticket";
import { WxService } from "../services/wechat/wx";
import { WxPayNotificationDto } from "../services/wechat/dto/wx-pay-common";

import globalLogger from '../services/logger';


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

    logger = globalLogger.child({ service: 'eventRPC' });

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

        return Event.from<Event>(r).toTransferDto();
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
        if (auth !== undefined) {
            query.verified = Boolean(auth);
        }

        const events = await this.mongoEvent.simpleFind(
            query,
            {
                skip: pagination.getSkip(),
                limit: pagination.getLimit(),
                sort: {
                    startAt: -1
                }
            }
        );

        const mapped = events.map((x) => Event.from<Event>(x).toTransferDto());

        const sites = await this.mongoSite.simpleFind(
            {
                _id: {
                    $in:
                        events.map((e) => e.siteId!).filter(Boolean)
                }
            }
        );
        const sitesMapped = sites.map((x) => Site.from<Site>(x).toTransferDto());

        pagination.setMeta(events, { sites: sitesMapped, total: await this.mongoEvent.count(query) });

        return mapped;
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
        });

        const participants = await this.mongoUser.simpleFind({
            _id: { $in: tickets.map((t) => t.userId) }
        });

        return participants.map((x) => User.from<User>(x).toTransferDto());
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
        const user = await session.assertUser();
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
            ...Event.from<Event>(event).toTransferDto(),
            site: site ? Site.from<Site>(site).toTransferDto() : undefined,
            creator: creator ? User.from<User>(creator).toTransferDto() : undefined,
            participants: participants.map((x) => User.from<User>(x).toTransferDto()),
            participating: participants.some((x) => x._id.toHexString() === user._id.toHexString())
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
        @Pick('info') infoObj?: { [k: string]: any },
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
            info: infoObj,
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
            if (transaction.expireAt! < new Date()) {
                transaction = undefined;
            }
        }

        if (!transaction) {
            transaction = Transaction.from({
                title: `活动门票: ${event.title} - ${ticket._id}`,
                reason: TRANSACTION_REASON.EVENT_TICKET_PURCHASE,
                fromUserId: user._id,
                pricing: event.pricing,
                currencyType: CURRENCY.CNY,
                status: TRANSACTION_STATUS.CREATED,
                targetId: ticket._id,
                targetType: this.mongoEventTicket.collectionName,

                expireAt: moment().add(1, 'day').toDate(),
            });
            transaction = await this.mongoTransaction.create(transaction!);
        }

        const now = new Date();

        _.merge(transaction, {
            wxPay: {
                merchId: this.wxService.wxPay.mchId,
                appId: this.wxService.wxConfig.appId,
                openId: user.wxOpenId[this.wxService.wxConfig.appId],
                progress: TRANSACTION_PROGRESS.INITIATED,

                initiatedAt: now,
                expireAt: moment(now).add(2, 'hours').toDate(),
            },
            status: TRANSACTION_STATUS.PAYMENT_PENDING
        });

        const transactionObj = Transaction.from<Transaction>({
            ...transaction
        });


        const wxReply = await this.wxService.createWxPayTransaction(transactionObj.createWxTransactionCreationDto());

        _.merge(transactionObj, {
            wxPay: {
                wxResult: wxReply,
                progress: TRANSACTION_PROGRESS.IN_PROGRESS
            }
        });

        await this.mongoTransaction.save(transactionObj);

        const sig = this.wxService.wxPaySign({
            prepay_id: wxReply.prepay_id,
        });

        return {
            ...sig,
            transaction
        }
    }

    @RPCMethod('wxpay.notify')
    async wxpayNotify(
        wxPayNotification: WxPayNotificationDto
    ) {
        let resource: { [k: string]: any } | undefined = wxPayNotification.resource;
        if (wxPayNotification.resource_type === 'encrypt-resource') {
            resource = this.wxService.wxPay.decryptJSON(wxPayNotification.resource);
        }

        if (!resource) {
            return {
                code: 'FUCKED',
                message: 'YOU FUCKED UP'
            }
        }

        switch (wxPayNotification.event_type) {
            case 'TRANSACTION.SUCCESS': {
                const now = new Date();
                const transaction = await this.mongoTransaction.updateOne(
                    { _id: new ObjectId(resource.out_trade_no), status: { $ne: TRANSACTION_STATUS.PAYMENT_SUCCEEDED } },
                    {
                        $set: {
                            'wxPay.wxTransactionId': resource.transaction_id,
                            'wxPay.progress': mapWxTradeStateToTransactionProgress(resource.trade_state),
                            'wxPay.completedAt': new Date(resource.success_time),
                            'wxPay.updatedAt': now,
                            [`wxPay.wxResult.${wxPayNotification.id}`]: { ...wxPayNotification, resource },

                            status: mapWxTransactionProgressToTransactionStatus(mapWxTradeStateToTransactionProgress(resource.trade_state)),
                            updatedAt: now,
                        }
                    }
                );

                if (transaction?.targetId && transaction.targetType === this.mongoEventTicket.collectionName) {
                    const ticket = await this.mongoEventTicket.findOne({ _id: transaction.targetId });
                    if (ticket) {
                        await this.mongoEventTicket.updateOne({ _id: ticket._id }, { $set: { status: TICKET_STATUS.VALID } });

                        await this.mongoTransaction.updateOne({ _id: transaction._id }, { $set: { status: TRANSACTION_STATUS.COMPLETED, updatedAt: new Date() } });
                    }
                }

                break;
            }
            default: {
                this.logger.warn(`Unknown WxPay notification: ${wxPayNotification.event_type}`, wxPayNotification);

                break;
            }
        }

        return {
            code: 'SUCCESS'
        }

    }
}
