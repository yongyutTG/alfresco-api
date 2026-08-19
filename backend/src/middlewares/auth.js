const { env } = require("../config/env");

// ใช้กับ /dev-frontend และ /dev-api เท่านั้น
// จุดประสงค์: ให้หน้า demo ในเครื่องเรียก API ได้โดยไม่ต้องเอา Bearer token ไปไว้ใน browser
function requireLocalhost(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "";
  const normalizedIp = ip.replace(/^::ffff:/, "");
  const allowed = ["127.0.0.1", "::1", "localhost"].includes(normalizedIp) || normalizedIp === "::ffff:127.0.0.1";

  if (!allowed) {
    return res.status(403).json({ message: "Forbidden: dev frontend is local-only" });
  }

  next();
}

// Step 2: ป้องกัน API สำหรับ external dev/Postman
// ทุกเส้นใต้ /api/alfresco ต้องส่ง Header: Authorization: Bearer <API_TOKEN>
function requireBearerToken(req, res, next) {
  if (!env.apiToken) {
    return res.status(500).json({ message: "API_TOKEN is not configured" });
  }

  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || token !== env.apiToken) {
    return res.status(401).json({ message: "Unauthorized: missing or invalid Bearer token" });
  }

  next();
}

module.exports = {
  requireLocalhost,
  requireBearerToken,
};
