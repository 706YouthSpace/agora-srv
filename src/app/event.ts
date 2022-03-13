import { AsyncService } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";

import { WxService } from "../services/wechat/wx";
import { EventTicket, MongoEventTicket } from "../db/event-ticket";
import { Event, MongoEvent } from "../db/event";
import { MongoSite, Site } from "../db/site";
import { MongoLiveConfig } from "../db/live-config";
import { MongoUser } from "../db/user";
import globalLogger from '../services/logger';

@singleton()
export class EventService extends AsyncService {

    logger = globalLogger.child({ service: 'eventService' });
    constructor(
        protected wxService: WxService,
        protected liveConfig: MongoLiveConfig,
        protected mongoEvent: MongoEvent,
        protected mongoEventTicket: MongoEventTicket,
        protected mongoSite: MongoSite,
        protected mongoUser: MongoUser,
    ) {
        super(...arguments);

        this.init().catch((err) => {
            this.emit('error', err);
        });
    }


    override async init() {
        await this.dependencyReady();

        this.emit('ready');
    }

    async sendEventNotification(ticket: EventTicket, event?: Event, site?: Site) {

        if (!event) {
            event = await this.mongoEvent.findOne({ _id: ticket.eventId });
        }
        if (event?.siteId && !site) {
            site = await this.mongoSite.findOne({ _id: event.siteId });
        }

        const user = await this.mongoUser.findOne({ _id: ticket.userId });
        if (!user) {
            return;
        }

        const openId = user.wxOpenId[ticket.wxAppId];
        if (!openId) {
            return;
        }

        const msgData = {
            thing1: { value: event?.title },  // 活动名称
            date2: { value: `${event?.startAt} ~ ${event?.endAt}` },  // 活动时间
            date5: { value: `${event?.startAt}` },  // 开始时间
            thing8: { value: event?.locationText || site?.locationText }, // 活动地点
            thing7: { value: event?.detail }, // 备注
        }

        const templateId = 'AMuUs66F9-Bz7faLu8q1qKIgzes8Xfg9Czfc9YeCMRs';
        try {
            await this.wxService.wxPlatform.wxoSendTemplateMessage(this.wxService.accessToken, {
                templateId,
                toUserOpenId: openId,
                data: msgData,
                page: `pages/actDetail/actDetail?id=${event!._id}`
            });
        } catch (err) {
            this.logger.warn(`Failed to notify user(${user._id})`, err);
        }

        return this.mongoEventTicket.updateOne({ _id: ticket._id }, { $set: { wxNotifyTemplateId: templateId } });
    }
}
