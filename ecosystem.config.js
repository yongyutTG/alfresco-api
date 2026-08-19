module.exports = {
  apps: [
    // Backend API
    // PM2 จะเข้าไปทำงานในโฟลเดอร์ backend แล้วรัน backend/server.js
    {
      name: "alfresco-api",
      script: "server.js",
      cwd: "./backend",
      env_file: "../.env",
      watch: true,
      ignore_watch: ["node_modules", "../node_modules", "../server.out.log", "../server.err.log"],
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
