const express = require("express");
const path = require("path");
const { env } = require("./config/env");
const { requireLocalhost } = require("./middlewares/auth");
const { apiRouter, devRouter } = require("./modules/alfresco/alfresco.route");

const app = express();

// ===== Flow หลักของระบบ =====
// 1) External Dev/Postman เรียก /api/alfresco/* พร้อม Header: Authorization: Bearer <API_TOKEN>
// 2) Dev Frontend เรียก /dev-api/alfresco/* เฉพาะ localhost ไม่ต้องถือ Bearer token ใน browser
// 3) Route -> Controller -> Service -> Repo
// 4) Repo ยิงไป Alfresco CMIS ด้วย Basic Auth จาก ALFRESCO_USER/ALFRESCO_PASS ใน .env
// 5) Utils map CMIS response แล้ว Controller ส่ง JSON กลับ

app.use(express.json());
app.use(express.static(path.join(env.projectRoot, "public")));
app.use("/dev-frontend", requireLocalhost, express.static(path.join(env.projectRoot, "dev-frontend")));

// หน้าเว็บหลักสำหรับเลือกโฟลเดอร์ ค้นหา และเปิดไฟล์จาก Alfresco
app.get("/", (req, res) => {
  res.sendFile(path.join(env.projectRoot, "public", "index.html"));
});

app.use("/api", apiRouter);
app.use("/dev-api", devRouter);

module.exports = app;
