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
        appSecret: "a60068c681f913064f06150f6fb3f101",
        signatureToken: "qJMXRUNfdr76dTveZ7QuRQHRonFrQgh9",
        aesEncryptionKey: "1zRpONewtPK9UMqzXVLLEA7rOsGxJn2QcvqME3eLgqQ",
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
