export const config = {
    server: {
        listenPort: 3001
    },
    tmpDir: "/tmp/x706",
    mongoUrl: "mongodb://x706:706666@192.168.110.129:27017/x706",
    wechat: {
        appId: "wx46d68a9da9163dcf",
        appSecret: "428c7f7fa41e8226f992ecddb6fd95ef",
        signatureToken: "sYQQt8is9yQkGFjmbwd8LfL4TDmeG2iC",
        aesEncryptionKey: "Xr59LQH0QFiR7ULJZV5Rtul6RceMmMfatKHbYQnjncM",
        callbackBaseUri: "/",
        serviceHosts: [
            "dev.local.naiver.org",
            "gw.naiver.org"
        ],
        webviewHosts: [
            "dev.local.naiver.org",
            "gw.naiver.org",
            "mp.weixin.qq.com"
        ],
        pay: {
            mchId:"1619891040",
            apiV3Key: "13810360402051086220184706706706",
            notifyUrl:"https://dev.access.naiver.org/api/activity/paymentNotify",
            certPath: "/etc/certs/apiclient_cert.pem",
            keyPath: "/etc/certs/apiclient_key.pem",
        }
    },
    aliyun: {
        user: 'wxa-server@706er.onaliyun.com',
        accessKey: 'LTAI5tNuUwcL8snboU3q2Me6',
        accessSecret: 'bRjbKctCcpZvNxochGau9X7cAcIwVj',

        ossEndpint: 'oss-cn-beijing.aliyuncs.com',
        ossBucket: 'x706'
        // ossInternal: 'x706.oss-cn-beijing-internal.aliyuncs.com',
    }
};

export default config;
