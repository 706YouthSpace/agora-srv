export enum WECHAT_MEDIA_TYPE {
    IMAGE = 'image',
    VOICE = 'voice',
    VIDEO = 'video',
    THUMB = 'thumb'
}

export interface WeChatMediaUploadReceipt {
    type: WECHAT_MEDIA_TYPE;
    media_id: string;
    created_at: number;
}
