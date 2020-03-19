export const config = {
    server: {
        listenPort: 3001
    },
    tmpDir: "/tmp",
    mongoUrl: "mongodb://---:---@127.0.0.1:27017",
    mongoDatabase: "x706",
    redis: {
        host: "127.0.0.1",
        port: 6379,
        password: '------'
    },
    wechat: {
        appId: "wx46d68a9da9163dcf",
        appSecret: "------",
        signatureToken: "------",
        aesEncryptionKey: "------",
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
    },
    aliCDN: {
        authKey: '------',
        cdnSecret: '------'
    }
};

export default config;
