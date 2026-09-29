const { env } = require("../config/env");

// ใช้สำหรับ frontend ที่เรียก API จาก browser คนละ origin
function allowConfiguredCors(req, res, next) {
  const origin = req.get("origin");
  const allowAllOrigins = env.corsAllowedOrigins.includes("*");

  if (origin && (allowAllOrigins || env.corsAllowedOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", allowAllOrigins ? "*" : origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept,X-File-Name,X-Folder-Path");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}

module.exports = {
  allowConfiguredCors,
};
