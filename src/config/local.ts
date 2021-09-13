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
