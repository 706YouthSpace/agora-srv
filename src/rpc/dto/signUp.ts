import { ObjectId } from "mongodb";
import { Prop, Dto } from "@naiverlabs/tskit"

// class SubscribeMsgPopupEvent {
//     templateId: string="";
//     subscribeStatusString: string="";
//     popupScene: string="";
// }

export class SignUp extends Dto {

    @Prop()
    userId?: ObjectId;

    @Prop()
    activityId?: ObjectId;
    
    @Prop()
    info?: string;

    @Prop({
        type: Date
    })
    createdAt?: Date;

    @Prop()
    paid?: string;

    @Prop()
    toUserName!: string;

    @Prop()
    fromUserName!: string;

    @Prop()
    createTime!: string;

    @Prop()
    msgType!: string;

    @Prop()
    event!: string;

    @Prop()
    templateId!: string;

}
