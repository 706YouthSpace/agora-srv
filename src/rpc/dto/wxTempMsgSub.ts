// {
//     "ToUserName": "gh_123456789abc",
//     "FromUserName": "o7esq5OI1Uej6Xixw1lA2H7XDVbc",
//     "CreateTime": "1620973045",
//     "MsgType": "event",
//     "Event": "subscribe_msg_popup_event",
//     "SubscribeMsgPopupEvent": [   {
//           "TemplateId": "hD-ixGOhYmUfjOnI8MCzQMPshzGVeux_2vzyvQu7O68",
//           "SubscribeStatusString": "accept",
//           "PopupScene": "0"
//       }],
//    }

import { Prop, Dto } from "@naiverlabs/tskit"

class SubscribeMsgPopupEvent {
    TemplateId: string="";
    SubscribeStatusString: string="";
    PopupScene: string="";
}

export class wxTempMsgSub extends Dto {

    @Prop()
    ToUserName!: string;

    @Prop()
    FromUserName!: string;

    @Prop()
    CreateTime!: string;

    @Prop()
    MsgType!: string;

    @Prop()
    Event!: string;

    @Prop({
        arrayOf: SubscribeMsgPopupEvent
    })
    SubscribeMsgPopupEvent!: SubscribeMsgPopupEvent[];



}