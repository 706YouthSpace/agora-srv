import { AutoCastable, Prop } from "@naiverlabs/tskit";
import { length } from "../../../app/validators";
import { currencyAmount, purchaseAmount } from "../../../app/validators";

export class WxPayAmoutDto extends AutoCastable {
    @Prop({ validate: currencyAmount, required: true, desc: '订单总金额，单位为分' })
    total!: number;

    @Prop({ validate: length(1, 16), default: 'CNY', desc: 'CNY：人民币，境内商户号仅支持人民币。' })
    currency?: string;
}

export class WxPayAmoutNotificationDto extends AutoCastable {
    @Prop({ validate: currencyAmount, required: true, desc: '订单总金额，单位为分' })
    total!: number;

    @Prop({ validate: currencyAmount, required: true, desc: '用户支付金额，单位为分' })
    payer_total!: number;

    @Prop({ required: true, validate: length(1, 16), desc: 'CNY：人民币，境内商户号仅支持人民币。' })
    currency!: string;

    @Prop({ required: true, validate: length(1, 16), desc: '用户支付币种' })
    payer_currency!: string;
}

export class WxPaySceneNotificationDto extends AutoCastable {

    @Prop({
        required: true,
        validate: length(1, 32),
        desc: '商户端设备号（门店号或收银设备ID）。'
    })
    device_id!: string;

}

export class WxPayPayerDto extends AutoCastable {
    @Prop({ validate: length(1, 128), required: true, desc: '用户在直连商户appid下的唯一标识。 下单前需获取到用户的Openid' })
    openid!: string;
}

export class WxPayGoodsDto extends AutoCastable {
    @Prop({ required: true, validate: length(1, 32), desc: '由半角的大小写字母、数字、中划线、下划线中的一种或几种组成。' })
    merchant_goods_id!: string;

    @Prop({ validate: length(1, 32), desc: '微信支付定义的统一商品编号（没有可不传）' })
    wechatpay_goods_id?: string;

    @Prop({ validate: length(1, 256), desc: '商品的实际名称' })
    goods_name?: string;

    @Prop({ required: true, validate: purchaseAmount, desc: '用户购买的数量' })
    quantity!: number;

    @Prop({ required: true, validate: currencyAmount, desc: '商品单价，单位为分' })
    unit_price!: number;

}

export class WxPayGoodsNotificationDto extends AutoCastable {
    @Prop({ required: true, validate: length(1, 32), desc: '商品编码' })
    goods_id!: string;

    @Prop({ required: true, validate: purchaseAmount, desc: '用户购买的数量' })
    quantity!: number;

    @Prop({ required: true, validate: currencyAmount, desc: '商品单价，单位为分' })
    unit_price!: number;

    @Prop({ required: true, validate: currencyAmount, desc: '商品优惠金额' })
    discount_amount!: number;

    @Prop({ validate: length(1, 128), desc: '商品备注信息' })
    goods_remark?: string;

}

export class WxPayDiscountDto extends AutoCastable {
    @Prop({
        validate: currencyAmount,
        desc:
            `1、商户侧一张小票订单可能被分多次支付，订单原价用于记录整张小票的交易金额。\n` +
            `2、当订单原价与支付金额不相等，则不享受优惠。\n` +
            `3、该字段主要用于防止同一张小票分多次支付，以享受多次优惠的情况，正常支付订单不必上传此参数。`
    })
    cost_price?: number;

    @Prop({
        validate: length(1, 32),
        desc: '商家小票',
    })
    invoice_id?: string;


    // @Prop({
    //     arrayOf: WxPayGoodsDto,
    //     validateArray: length(1, 6000),
    //     desc: '单品列表信息。条目个数限制：【1，6000】'
    // })
    goods_detail?: WxPayGoodsDto[];
}

export class WxPayDiscountNotificationDto extends AutoCastable {

    @Prop({
        required: true,
        validate: length(1, 32),
        desc: '券ID',
    })
    coupon_id!: string;

    @Prop({
        validate: length(1, 64),
        desc: '优惠名称',
    })
    name?: string;

    @Prop({
        validate: length(1, 32),
        desc: '优惠范围: GLOBAL：全场代金券 SINGLE：单品优惠',
    })
    scope?: string;

    @Prop({
        validate: length(1, 32),
        desc: '优惠类型: CASH- 代金券，需要走结算资金的预充值型代金券 NOCASH- 优惠券，不走结算资金的免充值型优惠券',
    })
    type?: string;

    @Prop({
        required: true,
        validate: currencyAmount,
        desc: `优惠券面额`
    })
    amount!: number;

    @Prop({
        validate: length(1, 32),
        desc: '活动ID',
    })
    stock_id?: string;

    @Prop({
        validate: currencyAmount,
        desc: `微信出资，单位为分`
    })
    wechatpay_contribute?: number;

    @Prop({
        validate: currencyAmount,
        desc: `商户出资，单位为分`
    })
    merchant_contribute?: number;

    @Prop({
        validate: currencyAmount,
        desc: `其他出资，单位为分`
    })
    other_contribute?: number;

    @Prop({
        validate: length(1, 16),
        desc: `CNY：人民币，境内商户号仅支持人民币。`
    })
    currency?: string;

    @Prop({
        arrayOf: WxPayGoodsNotificationDto,
        desc: '单品列表信息。'
    })
    goods_detail?: WxPayGoodsNotificationDto[];
}

export class WxPayStoreDto extends AutoCastable {

    @Prop({
        required: true,
        validate: length(1, 32),
        desc: '商户侧门店编号'
    })
    id!: string;

    @Prop({
        validate: length(1, 256),
        desc: '商户侧门店名称'
    })
    name?: string;

    @Prop({
        validate: length(1, 32),
        desc: '地区编码，详细请见省市区编号对照表'
    })
    area_code?: string;

    @Prop({
        validate: length(1, 512),
        desc: '详细的商户门店地址'
    })
    address?: string;
}

export class WxPaySceneDto extends AutoCastable {

    @Prop({
        required: true,
        validate: length(1, 45),
        desc: '用户的客户端IP，支持IPv4和IPv6两种格式的IP地址。'
    })
    payer_client_ip!: string;

    @Prop({
        validate: length(1, 32),
        desc: '商户端设备号（门店号或收银设备ID）。'
    })
    device_id?: string;


    @Prop({
        desc: '	商户门店信息'
    })
    store_info?: WxPayStoreDto;
}

export class WxPaySettleInfoDto extends AutoCastable {
    @Prop({ validate: length(1, 128), desc: '是否指定分账' })
    profit_sharing?: boolean;
}

export class WxPayNotificationDto extends AutoCastable {
    @Prop({ required: true, desc: '通知的唯一ID' })
    id!: string;

    @Prop({ required: true, desc: '通知创建的时间，遵循rfc3339标准格式' })
    create_time!: Date;

    @Prop({ required: true, desc: '通知的类型' })
    event_type!: string;

    @Prop({ required: true, desc: '通知的资源数据类型' })
    resource_type!: string;

    @Prop({ required: true, desc: '通知资源数据', dictOf: Object })
    resource!: { [k: string]: any };

    @Prop({ required: true, validate: purchaseAmount, desc: '用户购买的数量' })
    quantity!: number;

    @Prop({ required: true, validate: currencyAmount, desc: '商品单价，单位为分' })
    unit_price!: number;

}

export enum WXPAY_TRADE_TYPE {
    JSAPI = 'JSAPI',             //公众号支付
    NATIVE = 'NATIVE',           //扫码支付
    APP = 'APP',                 //APP支付
    MICROPAY = 'MICROPAY',       //付款码支付
    MWEB = 'MWEB',               //H5支付
    FACEPAY = 'FACEPAY',         //刷脸支付
}
export enum WXPAY_TRADE_STATE {
    SUCCESS = 'SUCCESS',          // 支付成功
    REFUND = 'REFUND',            // 转入退款
    NOTPAY = 'NOTPAY',            // 未支付
    CLOSED = 'CLOSED',            // 已关闭
    REVOKED = 'REVOKED',          // 已撤销（付款码支付）
    USERPAYING = 'USERPAYING',    // 用户支付中（付款码支付）
    PAYERROR = 'PAYERROR',        // 支付失败(其他原因，如银行返回失败)
}
