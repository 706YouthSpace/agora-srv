import { ResourceNotFoundError, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import { ChangeStreamDocument, ObjectId } from "mongodb";
import _ from "lodash";

import { Pick, RPCMethod } from "./civi-rpc/civi-rpc";
import { MongoLiveConfig } from "../db/live-config";
import { Config } from "../config";
import { Session } from "./dto/session";
import { MongoUser, User } from "../db/user";
import { Event, MongoEvent } from "../db/event";
import {
    MongoTransaction,
} from "../db/transaction";
import { Pagination } from "./dto/pagination";
import { MongoEventTicket } from "../db/event-ticket";
import { WxService } from "../services/wechat/wx";

interface WxaConf {
    appId: string;
    accessToken?: string;
    accessTokenExpiresBefore?: Date;
};

@singleton()
export class UserRPCHost extends RPCHost {

    wxaConfig: WxaConf = {} as any;
    constructor(
        protected mongoLiveConfig: MongoLiveConfig,
        protected config: Config,
        protected wxService: WxService,
        protected mongoUser: MongoUser,
        protected mongoEvent: MongoEvent,
        protected mongoEventTicket: MongoEventTicket,
        protected mongoTransaction: MongoTransaction,
    ) {
        super(...arguments);
        this.init();
    }

    async init() {

        await this.dependencyReady();

        const wxConfig = this.config.wechat;
        const wxaConfigKey = `wxa.${wxConfig.appId}`;
        this.wxaConfig = this.mongoLiveConfig.localGet(wxaConfigKey) || {} as any;
        this.wxaConfig.appId = wxConfig.appId;
        this.mongoLiveConfig.on('change', (key, changeEvent: ChangeStreamDocument) => {
            if (key !== wxaConfigKey) {
                return;
            }

            _.merge(this.wxaConfig, changeEvent.fullDocument);
        });

        this.emit('ready');
    }

    @RPCMethod('user.update')
    async userUpdate(
        session: Session,
        @Pick('avatarUrl') avatarUrl: URL,
        @Pick('nickName') nickName: string,
        @Pick('bio') bio: string
    ) {
        const user = await session.assertUser();

        const patch: Partial<User> = {}
        if (avatarUrl) {
            patch.avatar = avatarUrl.toString();
        }
        if (nickName) {
            patch.nickName = nickName;
        }
        if (bio) {
            patch.bio = bio;
        }
        const r = await this.mongoUser.updateOne({ _id: user._id }, { $set: patch, updatedAt: new Date() });

        return {
            ...r,
            avatarUrl: user.avatar,
            nickName: user.nickName,
            bio: user.bio,
        }
    }

    @RPCMethod('user.get')
    async getUser(
        session: Session,
        @Pick('id') id?: ObjectId,
    ) {
        let uid = id;
        if (!uid) {
            const me = await session.assertUser();
            uid = me._id;
        }
        const user = await this.mongoUser.findOne({ _id: uid });

        if (!user) {
            throw new ResourceNotFoundError(`User(${uid}) not found`);
        }

        return User.from<User>(user).toTransferDto();
    }

    @RPCMethod('user.wxaLogin')
    async wxaLogin(
        @Pick('code') code: string,
        session: Session,
    ) {
        const loginResult = await this.wxService.wxaLogin(code);

        if (session.__isNew) {
            session.httpSetToken();
        }

        const userResult = await this.mongoUser.upsertByWxOpenId(this.wxaConfig.appId, loginResult.openid, loginResult.unionid);

        if (!userResult.ok) {
            return null;
        }

        const user = userResult.value!;

        const sessionData = await session.fetch();
        sessionData.user = user._id;
        sessionData.wxaSessionKey = loginResult.session_key;

        await session.save();

        return User.from<User>(user).toTransferDto();
    }

    @RPCMethod('my.transaction.list')
    async listMyEventTickets(
        session: Session,
        pagination: Pagination
    ) {
        const user = await session.assertUser();

        const transactions = await this.mongoTransaction.simpleFind({
            fromUserId: user._id,
        }, {
            skip: pagination.getSkip(),
            limit: pagination.getLimit(),
        });


        pagination.setMeta(transactions, {
            total: await this.mongoTransaction.count({ fromUserId: user._id }),
        });

        return transactions;
    }

    @RPCMethod('my.eventTicket.list')
    async getMyEvent(
        session: Session,
        pagination: Pagination
    ) {
        const user = await session.assertUser();
        const query = {
            userId: user._id,
            // paid: 'Y'
        }

        const tickets = await this.mongoEventTicket.simpleFind(query, {
            skip: pagination.getSkip(),
            limit: pagination.getLimit(),
        });

        const events = await this.mongoEvent.simpleFind({
            _id: { $in: tickets.map((t) => t.eventId) }
        });

        const eventDtos = events.map((x)=> {
            return Event.from<Event>(x).toTransferDto();
        })

        pagination.setMeta(tickets, {
            events: eventDtos,
            total: await this.mongoEventTicket.count({ userId: user._id }),
        });

        return tickets;
    }

}
