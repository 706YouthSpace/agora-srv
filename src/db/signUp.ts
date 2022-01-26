import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';


export interface SignUp {
    _id: ObjectId;

    userId: ObjectId;

    activityId: ObjectId;
    
    info: string;

    paid: string;
    needToPay: string;

    toUserName: string;

    fromUserName: string;
    
    createTime: string;

    templateId: string;

    sent: string;

    wxPaidTimeEnd: string;

    outTradeNo: string;

    wxPrepayId: string;

    wxTransactionId: string;

    wxReturnCode: string;
    wxResultCode: string;
    wxErrCode: string;
    wxErrCodeDes: string;

}

@singleton()
export class MongoSignUp extends MongoCollection<SignUp> {
    collectionName = 'signUp';

}

export const mongoSignUp = container.resolve(MongoSignUp);
