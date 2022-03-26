import 'reflect-metadata';
import moment from 'moment';
import { AsyncService, throttle } from "@naiverlabs/tskit";
import { container, singleton } from "tsyringe";

import { WxService } from './services/wechat/wx';
import { MongoLiveConfig } from './db/live-config';
import { Recurred, ScheduleService } from './services/schedule';
import { MongoEventTicket, TICKET_STATUS } from './db/event-ticket';
import { EVENT_STATUS, MongoEvent } from './db/event';
import { EventService } from './app/event';
import globalLogger from './services/logger';
import _ from 'lodash';

@singleton()
export class HouseKeeper extends AsyncService {
    logger = globalLogger.child({ service: 'houseKeeperService' });

    constructor(
        protected wxService: WxService,
        protected mongoLiveConfig: MongoLiveConfig,
        protected mongoEvent: MongoEvent,
        protected mongoEventTicket: MongoEventTicket,
        protected schedule: ScheduleService,
        protected eventAppService: EventService
    ) {
        super(...arguments);

        this.init().catch((err) => {
            this.emit('error', err);
        });
    }

    async init() {

        await this.dependencyReady();

        this.logger.info('HouseKeeper dependency ready');

        this.refreshLiveAccessToken();

        this.emit('ready');
    }

    @Recurred('*/20 * * * *')
    async refreshLiveAccessToken() {
        this.logger.info('refreshLiveAccessToken in progress...');
        const receipt = await this.wxService.getAccessToken();

        await this.mongoLiveConfig.set(this.wxService.wxaConfigKey, {
            appId: this.wxService.wxConfig.appId,
            accessToken: receipt.access_token,
            accessTokenExpiresBefore: new Date(Date.now() + receipt.expires_in * 1000 * 0.9)
        });

        this.logger.info('refreshLiveAccessToken succeeded');
    }

    @Recurred('*/5 * * * *')
    async markUnpaiedTicketsCancelled() {
        this.logger.info('markUnpaiedTicketsCancelled in progress...');

        const r = await this.mongoEventTicket.updateMany({
            cancelAt: { $lte: new Date() },
            status: TICKET_STATUS.PENDING_PAYMENT
        }, {
            $set: { status: TICKET_STATUS.CANCELLED }
        });

        this.logger.info(`markUnpaiedTicketsCancelled succeeded. ${r.modifiedCount} ticket cancelled.`);
    }

    @Recurred('*/1 * * * *')
    async markEventsExpiredBasedOnEndTime() {
        this.logger.info('markEventsExpiredBasedOnEndTime in progress...');

        const r = await this.mongoEvent.updateMany({
            endAt: { $lte: new Date() },
            status: EVENT_STATUS.PASSED
        }, {
            $set: { status: EVENT_STATUS.EXPIRED }
        });

        this.logger.info(`markEventsExpiredBasedOnEndTime succeeded. ${r.modifiedCount} events expired.`);
    }


    @Recurred('*/1 * * * *')
    @throttle()
    async sendEventNotifications() {
        const now = new Date();

        while (true) {
            const event = await this.mongoEvent.updateOne({
                startAt: {
                    $lte: moment(now).add(1, 'hour').toDate(),
                    $gte: now
                },
                '__notificationSentOn': { $exists: false }
            }, {
                $set: {
                    __notificationSentOn: now
                }
            });

            if (!event) {
                break;
            }

            const ticketsToSendNotification = await this.mongoEventTicket.simpleFind({
                eventId: event._id,
                status: TICKET_STATUS.VALID,
                wxNotifyTemplateId: { $exists: false }
            });

            for (const ticket of ticketsToSendNotification) {
                await this.eventAppService.sendEventNotification(ticket, event);
            }
        }
    }
}


export const houseKeeper = container.resolve(HouseKeeper);
export default houseKeeper;
