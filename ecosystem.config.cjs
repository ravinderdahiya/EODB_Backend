module.exports = {
  apps: [
    {
      name: "eodb-backend",
      script: "./src/server.js",
      exec_mode: "cluster",
      instances: "max",
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "development",
        ALLOW_INSECURE_COOKIES: "true"
      },
      env_production: {
        NODE_ENV: "production",
        ALLOW_INSECURE_COOKIES: "false"
      }
    }
  ]
};
