
import { InjectProperty } from "../../lib/property-injector";
import { Session } from "./session";
import { MongoUser } from "../../db/user";
import { ApplicationError } from "@naiverlabs/tskit";
import { ObjectId } from "mongodb";

export class SessionUser extends Session {


    @InjectProperty()
    protected mongoUser!: MongoUser;


    async assertUser() {

        await this.fetch();

        if (!this.data?.user) {
            throw new ApplicationError(40101, { message: 'User login required' });
        }


        return this.data.user as ObjectId;
    }

}
