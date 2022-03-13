export const config = {
    server: {
        listenPort: 3001
    },
    tmpDir: "/tmp/x706",
    mongoUrl: "mongodb://192.168.110.41:27017",
    mongoDatabase: "x706",
    redis: {
        host: "192.168.110.42",
        port: 6379
    },
    wechat: {
        appId: "wxcba08e00acb7c966",
        appSecret: "a60068c681f913064f06150f6fb3f101",
        signatureToken: "qJMXRUNfdr76dTveZ7QuRQHRonFrQgh9",
        aesEncryptionKey: "1zRpONewtPK9UMqzXVLLEA7rOsGxJn2QcvqME3eLgqQ",
        activityVerifyMsgId:"fj0OoUP4P7gX9o88swET2d_HrSLvq64gJEV_rwNOAwM",
        activityRemindMsgId:"AMuUs66F9-Bz7faLu8q1qKIgzes8Xfg9Czfc9YeCMRs",
        miniprogramState:"trial" , // developer为开发版；trial为体验版；formal为正式版
        mchid:"1605653192",
        notifyUrl:"https://dev.access.naiver.org/api/activity/paymentNotify",
        serviceHosts: [
            "x706.access.naiver.org",
            "gw.naiver.org"
        ],
        webviewHosts: [
            "x706.access.naiver.org",
            "gw.naiver.org",
            "mp.weixin.qq.com"
        ],
        pay: {
            mchid:"1619891040",
            apiV3Key: "13810360402051086220184706706706",
            notifyUrl:"https://dev.access.naiver.org/api/activity/paymentNotify",
            certPath: "/data/apiclientCert/apiclient_cert.pem",
            keyPath: "/data/apiclientCert/apiclient_key.pem",
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
