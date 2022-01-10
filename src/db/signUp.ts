import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { MongoCollection } from './base';


export interface SignUp {
    _id: ObjectId;

    userId: ObjectId;

    activityId: string;
    
    info: string;

    paid: string;

    toUserName: string;

    fromUserName: string;
    
    createTime: string;

    templateId: string;
    subscribeStatusString: string;

    sent: string;
}

@singleton()
export class MongoSignUp extends MongoCollection<SignUp> {
    collectionName = 'signUp';

}

export const mongoSignUp = container.resolve(MongoSignUp);
