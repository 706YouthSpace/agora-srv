import { HTTPService, HTTPServiceConfig, retry } from "@naiverlabs/tskit";
import * as inf from '../services/wechat/interface';

import { singleton } from 'tsyringe';
import { config } from "../config";
//import {WxHTTP } from "../services/wechat/wx-http" ;
import { MongoSignUp } from "../db/signUp";
import logger from '../services/logger';

const wxAppId = config.wechat.appId;
const wxAppSecret = config.wechat.appSecret;
const RETRY_INTERVAL_MS = 1500;
const RETRY_TIMES = 2;

@singleton()
export class CronJob extends HTTPService {

    //wxHttp:WxHTTP=new WxHTTP();
    accessToken: string="";
    mongoSignUp: MongoSignUp=new MongoSignUp();
    constructor(baseUrl: string = 'https://api.weixin.qq.com', config: HTTPServiceConfig = {}) {
        super(baseUrl, config);
    }

     startCronJob(){
        setInterval(doCronJob,60*1000);
        logger.info('Started CronJob ! ');
     }

     @retry(RETRY_TIMES, RETRY_INTERVAL_MS)
     async getWxAccessToken(appId: string, appSecret: string) {
        const result = await this.postJson<inf.WxoAccessTokenReceipt>(
            '/cgi-bin/token',
            {
                appid: appId,
                secret: appSecret,
                grant_type: 'client_credential'
            }
        );
   
        return result.data;
    }
    
    async refreshAccessToken(){
        // https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
        let data=await this.getWxAccessToken(wxAppId,wxAppSecret);
        this.accessToken=data.access_token;
    }

     getAccessToken(){
         return this.accessToken ;
     }

     // 发送活动提醒消息到微信
     async sendWxTemplateMsg(){
         let query={sent:"N",
                    subscribeStatusString:"accept",
                    templateId:config.wechat.activityRemindMsgId }; 

         //const result = await this.mongoSignUp.collection.find(query).toArray() ;
         const result = await this.mongoSignUp.collection.aggregate(
            [
                {
                   $lookup:
                      {
                         from: "activities",
                         localField: "activityId",
                         foreignField: "_id",
                         as: "activities_info"
                     }
                },
                { $match: query },
                { $unwind: "$activities_info" },
                
             ]
        ).toArray() as any;

         for(let rt of result){
             let time1=(rt.activities_info.startAt as Date).getTime()-(new Date()).getTime();
             if (!(time1>0 && time1<3600*1000)){
                continue;
             }
            //POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=ACCESS_TOKEN
            let msgInfo={
                 thing1: { value: rt.activities_info.title  },  // 活动名称
                 date2: { value: rt.activities_info.startAt+"~"+rt.activities_info.endAt } ,  // 活动时间
                 date5: { value: rt.activities_info.startAt } ,  // 开始时间
                 thing8: { value: rt.activities_info.locationText } , // 活动地点
                 thing7: { value: rt.activities_info.detail} , // 备注
                };
            // let sendInfo={
            //     access_token:this.getAccessToken(),
            //     touser:rt.fromUserName,
            //     template_id:rt.templateId,
            //     page:"",
            //     data:msgInfo,
            //     miniprogram_state:config.wechat.miniprogramState,
            //     lang:"zh_CN"  // 支持zh_CN(简体中文)、en_US(英文)、zh_HK(繁体中文)、zh_TW(繁体中文)，默认为zh_CN
            // };

            //发送活动提醒消息到微信
            let page="pages/actDetail/actDetail?id="+rt.activities_info._id;
            await this.wxSendTempMsgNew(this.getAccessToken(),
                                                    rt.templateId,
                                                    rt.fromUserName,
                                                    config.wechat.miniprogramState,
                                                    "zh_CN",
                                                    page,
                                                    msgInfo
                                                    );
            
            // 更新报名表 
            const update = {sent:"Y"};
            await this.mongoSignUp.set(rt._id,update) ;

         }
     
     }

     
    async wxSendTempMsgNew(
        accessToken: string,
        templateId: string,
        toUserOpenId: string,
        miniprogram_state: string,
        lang:string,
        page:string,
        data: object
    ) {

        const qObj: any = {
            template_id: templateId, 
            touser: toUserOpenId,
            miniprogram_state: miniprogram_state,
            lang:lang,
            page:page,
            data
        };
        
        const result = await this.postJson<inf.WeChatErrorReceipt>(
            '/cgi-bin/message/subscribe/send',
            { access_token: accessToken },
            qObj
        );

        return result.data;
    }

}

const cronJob = new CronJob ;

function doCronJob(){
    cronJob.refreshAccessToken();
    cronJob.sendWxTemplateMsg();
 }
 

export default cronJob;