export const config = {
    server: {
        listenPort: 3001
    },
    tmpDir: "/tmp",
    mongoUrl: "mongodb://---.---.---.---:27017",
    mongoDatabase: "x706",
    redis: {
        host: "---.---.---.---",
        port: 6379
    },
    wechat: {
        appId: "---",
        appSecret: "---",
        signatureToken: "---",
        aesEncryptionKey: "---",
        callbackBaseUri: "/",
        serviceHosts: [
            "x706.access.naiver.org",
        ],
        webviewHosts: [
            "x706.access.naiver.org",
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
