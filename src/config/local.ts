export const config = {
    debug: true,
    logStyle: 'text',
    port: 3001,
    tmpDir: "/tmp/x706",
    mongoUrl: "YOUR_MONGO_URL_HERE",
    wechat: {
        appId: "YOUR_WXA_ID_HERE",
        appSecret: "YOUR_WXA_KEY_HERE",
        signatureToken: "YOUR_WX_SIGNATURE_TOKEN_HERE",
        aesEncryptionKey: "YOUR_WX_AES_KEY_HERE",
        pay: {
            mchId: "YOUR_MCHID_HERE",
            apiV3Key: "YOUR_APIV3_KEY_HERE",
            notifyUrl: "YOUR_NOTIFY_URL_HERE",
            certPath: "YOUR_CLIENT_CERT_PATH_HERE",
            keyPath: "YOUR_CLIENT_CERT_KEY_PATH_HERE",
        }
    },
    aliyun: {
        user: 'YOUR_ALIYUN_USER_NAME_HERE',
        accessKey: 'YOUR_ALIYUN_ACCESS_KEY_HERE',
        accessSecret: 'YOUR_ALIYUN_ACCESS_SECRET_HERE',

        ossEndpint: 'YOUR_OSS_ENDPOINT_HERE',
        ossBucket: 'YOUR_OSS_BUCKET_HERE'
        // ossInternal: 'x706.oss-cn-beijing-internal.aliyuncs.com',
    },
    amap: {
        key: 'YOUR_AMAP_KEY_HERE',
        secret: 'YOUR_AMAP_SIGNATURE_SECRET_HERE'
    }
};

export default config;
