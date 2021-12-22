import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';


export interface WxTempMsgSub {
    _id: ObjectId;

    ToUserName: string;

    FromUserName: string;
    
    CreateTime: string;

    TemplateId: string;
    SubscribeStatusString: string;

    Sent: string;
}

@singleton()
export class MongoWxTempMsgSub extends MongoCollection<WxTempMsgSub> {
    collectionName = 'wxTempMsgSubMsgSub';

}

export const mongoWxTempMsgSub = container.resolve(MongoWxTempMsgSub);
