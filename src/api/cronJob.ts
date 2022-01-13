import { config } from "../config";
import {WxHTTP } from "../services/wechat/wx-http" ;
import { MongoSignUp,SignUp } from "../db/signUp";

const wxAppId = config.wechat.appId;
const wxAppSecret = config.wechat.appSecret;


export class CronJob {

    wxHttp:WxHTTP=new WxHTTP();
    accessToken: string="";
    mongoSignUp: MongoSignUp=new MongoSignUp();

    async startCronJob(){
        setInterval(this.doCronJob,60*1000);
     }
     
     async doCronJob(){
        this.refreshAccessToken();
        this.sendWxTemplateMsg();
     }
     
     async refreshAccessToken(){
         // https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
         let data=await this.wxHttp.getAccessToken(wxAppId,wxAppSecret);
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
            let data=await this.wxHttp.wxSendTempMsgNew(this.getAccessToken(),
                                                    rt.templateId,
                                                    rt.fromUserName,
                                                    config.wechat.miniprogramState,
                                                    "zh_CN",
                                                    msgInfo);
            
            // 更新报名表 
            const update = {sent:"Y"};
            await this.mongoSignUp.set(rt._id,update) ;

         }
     
     }

}
