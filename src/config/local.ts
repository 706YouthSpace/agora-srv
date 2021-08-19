export const config = {
    server: {
        listenPort: 3001
    },
    tmpDir: "/tmp/x706",
    mongoUrl: "mongodb://x706:706666@127.0.0.1:27017/x706",
    redis: {
        host: "192.168.110.42",
        port: 6379
    },
    wechat: {
        appId: "wxcba08e00acb7c966",
        appSecret: "a60068c681f913064f06150f6fb3f101",
        signatureToken: "qJMXRUNfdr76dTveZ7QuRQHRonFrQgh9",
        aesEncryptionKey: "1zRpONewtPK9UMqzXVLLEA7rOsGxJn2QcvqME3eLgqQ",
        callbackBaseUri: "/",
        serviceHosts: [
            "dev.local.naiver.org",
            "gw.naiver.org"
        ],
        webviewHosts: [
            "dev.local.naiver.org",
            "gw.naiver.org",
            "mp.weixin.qq.com"
        ]
    },
    seed: {
        sessionHasher: "x706",
        urlSigningHasher: "x706"
    },
    storage: {
        sha256Root: "/data/sha256storage",
        sha256OSS: {
            region: "oss-cn-beijing",
            bucket: "naiverlabs-sha256",
            accessKeyId: "LTAI4Fh8FdN94xQdVeqMYS4t",
            accessKeySecret: "pSLE2PjlYpE07tbE9fM5FZ3BnXFqja"
        }
    }
};

export default config;
