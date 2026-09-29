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

function numberFromEnv(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const env = {
  projectRoot,
  nodeEnv: process.env.NODE_ENV || "development",
  alfrescoRequestTimeoutMs: numberFromEnv("ALFRESCO_REQUEST_TIMEOUT_MS", 30000),
  defaultMaxItems: numberFromEnv("DEFAULT_MAX_ITEMS", 100),
  maxListItems: numberFromEnv("MAX_LIST_ITEMS", 1000),
  maxSearchItems: numberFromEnv("MAX_SEARCH_ITEMS", 1000),
  alfrescoCmis: `${alfrescoHost}/alfresco/api/-default-/public/cmis/versions/1.1/browser`,
  port: Number(process.env.PORT || 3005),
  alfrescoHost,
  alfrescoCmisUrl: `${alfrescoHost}/alfresco/api/-default-/public/cmis/versions/1.1/browser`,
  alfrescoUser: process.env.ALFRESCO_USER,
  alfrescoPass: process.env.ALFRESCO_PASS,
  apiToken: process.env.API_TOKEN,
  writeApiToken: process.env.WRITE_API_TOKEN,
  corsAllowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

module.exports = { env };
