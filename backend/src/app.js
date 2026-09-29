const express = require("express");
const path = require("path");
const { env } = require("./config/env");
const { notFound } = require("./middlewares/errorHandler");
const alfrescoController = require("./modules/alfresco/alfresco.controller");
const { allowConfiguredCors } = require("./middlewares/cors");
const { apiRouter, router } = require("./modules/alfresco/alfresco.route");

const app = express();

// All Alfresco routes use the reference contract and the configured service account.
app.use(allowConfiguredCors);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(env.projectRoot, "public")));

// หน้าเว็บหลักสำหรับเลือกโฟลเดอร์ ค้นหา และเปิดไฟล์จาก Alfresco
app.get("/", (req, res) => {
  res.sendFile(path.join(env.projectRoot, "public", "index.html"));
});

app.use("/api", apiRouter);
app.get("/health", alfrescoController.health);
app.use("/user-api/alfresco", router);
app.use(notFound);

module.exports = app;
