const { env } = require("../config/env");

// Step 4: สร้าง Basic Auth สำหรับให้ backend ไปเรียก Alfresco ด้วย service account จาก .env
// Base64 ไม่ใช่การเข้ารหัส เป็นรูปแบบของ HTTP Basic Authentication
function createAlfrescoAuthHeader() {
  const token = Buffer.from(`${env.alfrescoUser}:${env.alfrescoPass}`, "utf8").toString("base64");
  return { Authorization: `Basic ${token}` };
}

module.exports = {
  createAlfrescoAuthHeader,
};
