module.exports = {
    apps: [
        {
            name: "api",
            script: "build/main.js",
            instances: 4,
            exec_mode: "cluster",
            cwd: __dirname,
            node_args: "--icu-data-dir=node_modules/full-icu",
            max_memory_restart: "2G",
            env: {
                NODE_ENV: "prod"
            }
        }
    ]
}