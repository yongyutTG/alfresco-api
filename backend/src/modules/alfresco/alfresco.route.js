const express = require("express");
const multer = require("multer");
const alfrescoController = require("./alfresco.controller");
const { requireBearerToken, requireLocalhost, requireWriteBearerToken } = require("../../middlewares/auth");

const apiRouter = express.Router();
const devRouter = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

// ===== External Dev/Postman API =====
// ทุกเส้นในกลุ่มนี้ต้องแนบ Header: Authorization: Bearer <API_TOKEN>

// GET /api/health
apiRouter.get("/health", alfrescoController.health);

// GET /api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
apiRouter.get("/alfresco/folders", requireBearerToken, alfrescoController.folders);

// GET /api/alfresco/folders/files?path=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100
apiRouter.get("/alfresco/folders/files", requireBearerToken, alfrescoController.foldersFiles);

// q/keyword/name = ค้นแบบ LIKE, exactName/fileName = ค้นชื่อไฟล์เต็มแบบ =
// GET /api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277
// GET /api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&exactName=23017_116969.pdf
apiRouter.get("/alfresco/documents", requireBearerToken, alfrescoController.documents);

// GET /api/alfresco/documents/:id/content?name=file.pdf
apiRouter.get("/alfresco/documents/:id/content", requireBearerToken, alfrescoController.documentContent);

// ===== Write API =====
// ใช้ WRITE_API_TOKEN แยกจาก read token

// POST /api/alfresco/documents
// multipart/form-data: folderPath=<path>, file=<binary>, name=<optional file name>
apiRouter.post("/alfresco/documents", requireWriteBearerToken, upload.single("file"), alfrescoController.uploadDocument);

// PATCH /api/alfresco/documents/:id
// application/json: { "name": "new-file-name.pdf" }
apiRouter.patch("/alfresco/documents/:id", requireWriteBearerToken, alfrescoController.renameDocument);

// DELETE /api/alfresco/documents/:id
apiRouter.delete("/alfresco/documents/:id", requireWriteBearerToken, alfrescoController.deleteDocument);

// Legacy routes: เก็บไว้เพื่อไม่ให้ระบบเดิมที่เรียก path เก่าพัง
apiRouter.get("/alfresco/root", requireBearerToken, alfrescoController.root);
apiRouter.get("/alfresco/sites", requireBearerToken, alfrescoController.sites);
apiRouter.get("/alfresco/children", requireBearerToken, alfrescoController.children);
apiRouter.get("/alfresco/files", requireBearerToken, alfrescoController.files);
apiRouter.get("/alfresco/file-names", requireBearerToken, alfrescoController.fileNames);
// Legacy search: รองรับ q แบบ LIKE และ exactName/fileName แบบ =
apiRouter.get("/alfresco/search-files", requireBearerToken, alfrescoController.searchFiles);
apiRouter.get("/alfresco/object", requireBearerToken, alfrescoController.object);
apiRouter.get("/alfresco/content", requireBearerToken, alfrescoController.content);

// ===== Dev Frontend API =====
// ใช้เฉพาะ localhost สำหรับหน้า /dev-frontend เท่านั้น Browser ไม่ต้องถือ Bearer token เอง
devRouter.get("/alfresco/folders", requireLocalhost, alfrescoController.folders);
devRouter.get("/alfresco/documents", requireLocalhost, alfrescoController.devDocuments);
devRouter.get("/alfresco/documents/:id/content", requireLocalhost, alfrescoController.documentContent);

module.exports = {
  apiRouter,
  devRouter,
};
