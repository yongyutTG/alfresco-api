const fs = require("fs");
const path = require("path");

const auditLogPath = path.resolve(__dirname, "../../logs/audit.log");

function getClientIp(req) {
  const forwardedFor = req.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

function buildBaseAuditEvent(req, action, details = {}) {
  return {
    time: new Date().toISOString(),
    username: req.alfrescoUsername || details.username || null,
    action,
    documentId: details.documentId || req.params?.id || req.query?.id || null,
    fileName: details.fileName || req.query?.name || req.body?.name || null,
    folderPath: details.folderPath || req.query?.folderPath || req.query?.path || null,
    searchText: details.searchText ?? req.query?.q ?? req.query?.keyword ?? req.query?.exactName ?? null,
    requestPath: req.originalUrl,
    method: req.method,
    ip: getClientIp(req),
    userAgent: req.get("user-agent") || null,
    status: details.status || "SUCCESS",
    message: details.message || null,
  };
}

function writeAuditLog(event) {
  try {
    fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
    fs.appendFileSync(auditLogPath, `${JSON.stringify(event)}\n`, "utf8");
  } catch (err) {
    console.error("[AUDIT LOG FAILED]", err.message);
  }
}

function audit(req, action, details = {}) {
  writeAuditLog(buildBaseAuditEvent(req, action, details));
}

module.exports = {
  audit,
};
