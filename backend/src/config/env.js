const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");

// Step 1: โหลดค่า .env จาก root project
// ใช้ตั้งค่า ALFRESCO_HOST, ALFRESCO_USER, ALFRESCO_PASS, API_TOKEN, PORT
function loadLocalEnv() {
  const envPath = path.join(projectRoot, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const alfrescoHost = process.env.ALFRESCO_HOST || "http://172.17.1.21";

const env = {
  projectRoot,
  port: Number(process.env.PORT || 3005),
  alfrescoHost,
  alfrescoCmisUrl: `${alfrescoHost}/alfresco/api/-default-/public/cmis/versions/1.1/browser`,
  alfrescoUser: process.env.ALFRESCO_USER,
  alfrescoPass: process.env.ALFRESCO_PASS,
  apiToken: process.env.API_TOKEN,
  writeApiToken: process.env.WRITE_API_TOKEN,
};

module.exports = { env };
