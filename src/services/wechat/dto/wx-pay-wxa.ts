import { AutoCastable, Prop } from "@naiverlabs/tskit";
import { length } from "../../../app/validators";
import { URL } from "url";
import { validNotifyUrl } from "../../../app/validators";
import { WxPayAmoutDto, WxPayPayerDto, WxPayDiscountDto, WxPaySceneDto, WxPaySettleInfoDto, WXPAY_TRADE_TYPE, WXPAY_TRADE_STATE, WxPayAmoutNotificationDto } from "./wx-pay-common";

export class WxPayCreateTransactionDto extends AutoCastable {
    @Prop({
        required: true, validate: length(1, 32),
        desc: `由微信生成的应用ID，全局唯一。请求基础下单接口时请注意APPID的应用属性，例如公众号场景下，需使用应用属性为公众号的APPID`
    })
    appid!: string;

    @Prop({ required: true, validate: length(1, 32), desc: '直连商户的商户号，由微信支付生成并下发。' })
    mchid!: string;

    @Prop({ required: true, validate: length(1, 127), desc: '商品描述' })
    description!: string;

    @Prop({ required: true, validate: length(6, 32), desc: '商户系统内部订单号，只能是数字、大小写字母_-*且在同一个商户号下唯一' })
    out_trade_no!: string;

    @Prop({ desc: '订单失效时间，遵循rfc3339标准格式，格式为YYYY-MM-DDTHH:mm:ss+TIMEZONE，YYYY-MM-DD表示年月日，T出现在字符串中，表示time元素的开头，HH:mm:ss表示时分秒，TIMEZONE表示时区（+08:00表示东八区时间，领先UTC 8小时，即北京时间）。例如：2015-05-20T13:29:35+08:00表示，北京时间2015年5月20日 13点29分35秒。订单失效时间是针对订单号而言的，由于在请求支付的时候有一个必传参数prepay_id只有两小时的有效期，所以在重入时间超过2小时的时候需要重新请求下单接口获取新的prepay_id。其他详见时间规则 time_expire只能第一次下单传值，不允许二次修改，二次修改系统将报错。如用户支付失败后，需再次支付，需更换原订单号重新下单。' })
    time_expire?: Date;

    @Prop({ validate: length(1, 128), desc: '附加数据，在查询API和支付通知中原样返回，可作为自定义参数使用' })
    attach?: string;

    @Prop({ required: true, validate: validNotifyUrl, desc: '异步接收微信支付结果通知的回调地址，通知url必须为外网可访问的url，不能携带参数。 公网域名必须为https，如果是走专线接入，使用专线NAT IP或者私有回调域名可使用http' })
    notify_url!: URL;

    @Prop({ validate: length(1, 32), desc: '订单优惠标记' })
    goods_tag?: string;

    @Prop({ required: true, desc: '订单金额信息' })
    amount!: WxPayAmoutDto;

    @Prop({ required: true, desc: '支付者信息' })
    payer!: WxPayPayerDto;

    @Prop({ desc: '优惠功能' })
    detail?: WxPayDiscountDto;

    @Prop({ desc: '支付场景描述' })
    scene_info?: WxPaySceneDto;

    @Prop({ desc: '结算信息' })
    settle_info?: WxPaySettleInfoDto;
}


export class WxPayPaymentSucceedNotificationDto extends AutoCastable {
    @Prop({
        required: true, validate: length(1, 32),
        desc: `直连商户申请的公众号或移动应用appid。`
    })
    appid!: string;

    @Prop({ required: true, validate: length(1, 32), desc: '直连商户的商户号，由微信支付生成并下发。' })
    mchid!: string;

    @Prop({ required: true, validate: length(6, 32), desc: '商户系统内部订单号，只能是数字、大小写字母_-*且在同一个商户号下唯一' })
    out_trade_no!: string;


    @Prop({ required: true, validate: length(1, 32), desc: '微信支付系统生成的订单号' })
    transaction_id!: string;


    @Prop({ required: true, type: WXPAY_TRADE_TYPE, desc: '交易类型' })
    trade_type!: WXPAY_TRADE_TYPE;

    @Prop({ required: true, type: WXPAY_TRADE_STATE, desc: '交易状态' })
    trade_state!: WXPAY_TRADE_STATE;

    @Prop({ required: true, validate: length(1, 256), desc: '交易状态描述' })
    trade_state_desc!: string;

    @Prop({ required: true, validate: length(1, 16), desc: '银行类型，采用字符串类型的银行标识。银行标识请参考《银行类型对照表》 https://pay.weixin.qq.com/wiki/doc/apiv3/terms_definition/chapter1_1_3.shtml#part-6' })
    bank_type!: string;

    @Prop({ validate: length(1, 128), desc: '附加数据，在查询API和支付通知中原样返回，可作为自定义参数使用' })
    attach?: string;

    @Prop({ required: true, validate: validNotifyUrl, desc: '支付完成时间' })
    notify_success_timeurl!: Date;

    @Prop({ required: true, desc: '订单金额信息' })
    amount!: WxPayAmoutNotificationDto;

    @Prop({ required: true, desc: '支付者信息' })
    payer!: WxPayPayerDto;

    @Prop({ arrayOf: WxPayDiscountDto, desc: '优惠功能, 享受优惠时返回该字段' })
    promotion_detail?: WxPayDiscountDto[];

}
