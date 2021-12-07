import { ObjectId } from "mongodb";
import { Prop, Dto } from "@naiverlabs/tskit"

export class SignUp extends Dto {

    @Prop()
    userId?: ObjectId;

    @Prop()
    activityId?: string;
    
    @Prop()
    info?: string;

    @Prop({
        type: Date
    })
    createdAt?: Date;

    @Prop()
    paid?: string;


}
