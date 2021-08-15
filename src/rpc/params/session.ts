import { MongoSession } from "../../db/session";
import { ObjectId } from "mongodb";
import { RPCParam, Prop } from "tskit";
import { autoInjectable } from 'tsyringe';


@autoInjectable()
export class Session extends RPCParam {

    static fromObject(input: object) {
        const parsed = super.fromObject(input) as Session;

        if (!parsed.sessionId) {

            parsed.sessionId = new ObjectId();

            parsed.__isNew = true;

            parsed.data = {};

            return parsed;
        }

        return parsed;
    }


    __isNew: boolean = false;

    data?: { [k: string]: any };

    @Prop()
    sessionId!: ObjectId;

    constructor(protected mongoSession: MongoSession) {
        super();
    }


    async fetch() {

        if (this.__isNew) {
            return this.data;
        }

        await this.mongoSession.serviceReady();

        this.data = await this.mongoSession.get(this.sessionId);

        return this.data;
    }

    async save() {

        if (!this.data) {
            return;
        }

        await this.mongoSession.serviceReady();

        return this.mongoSession.set(this.sessionId, this.data);
    }

    async clear() {

        await this.mongoSession.serviceReady();
        const r = await this.mongoSession.clear(this.sessionId);
        this.data = {};

        return r;
    }

}
