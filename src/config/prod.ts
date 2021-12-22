export const config = {
    server: {
        listenPort: 3001
    },
    tmpDir: "/tmp",
    mongoUrl: "mongodb://x706:706666@127.0.0.1:27017",
    mongoDatabase: "x706",
    redis: {
        host: "127.0.0.1",
        port: 6379,
        password: '706666'
    },
    wechat: {
        appId: "wx46d68a9da9163dcf",
        appSecret: "428c7f7fa41e8226f992ecddb6fd95ef",
        signatureToken: "sYQQt8is9yQkGFjmbwd8LfL4TDmeG2iC",
        aesEncryptionKey: "Xr59LQH0QFiR7ULJZV5Rtul6RceMmMfatKHbYQnjncM",
        activityVerifyMsgId:"fj0OoUP4P7gX9o88swET2d_HrSLvq64gJEV_rwNOAwM",
        activityRemindMsgId:"AMuUs66F9-Bz7faLu8q1qKIgzes8Xfg9Czfc9YeCMRs",
        miniprogramState:"formal" , // developer为开发版；trial为体验版；formal为正式版
        callbackBaseUri: "/",
        serviceHosts: [
            "api.wxa1.706er.com",
            "cdn.wxa1.706er.com"
        ],
        webviewHosts: [
            "api.wxa1.706er.com",
            "cdn.wxa1.706er.com",
            "mp.weixin.qq.com"
        ]
    },
    seed: {
        sessionHasher: "x706",
        urlSigningHasher: "x706"
    },
    storage: {
        sha256Root: "/data/sha256storage"
    }
};

export default config;
