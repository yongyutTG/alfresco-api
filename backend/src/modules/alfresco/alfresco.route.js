const express = require("express");
const alfrescoController = require("./alfresco.controller");

const { requireBearerToken, requireWriteBearerToken } = require("../../middlewares/auth");
const { createAlfrescoAuthHeader } = require("../../utils/authHeader");
const { env } = require("../../config/env");
const router = express.Router();
router.use((req, res, next) => {
  const authenticate = ["GET", "HEAD"].includes(req.method) ? requireBearerToken : requireWriteBearerToken;
  authenticate(req, res, () => {
    if (!env.alfrescoUser || !env.alfrescoPass) {
      return res.status(500).json({ message: "ALFRESCO_USER and ALFRESCO_PASS are not configured", status: 500 });
    }
    req.alfrescoUsername = env.alfrescoUser;
    req.alfrescoAuthHeaders = createAlfrescoAuthHeader();
    next();
  });
});
const rawFileBody = express.raw({
  type: ["application/octet-stream", "application/pdf", "image/*", "text/*", "application/*"],
  limit: "100mb",
});

router.get("/folders", alfrescoController.listFolders);
router.get("/folders/tree", alfrescoController.listFolderTree);
router.post("/documents", rawFileBody, alfrescoController.createDocument);
router.get("/documents", alfrescoController.listDocuments);
router.get("/documents/search", alfrescoController.searchDocuments);
router.get("/documents/location", alfrescoController.getDocumentLocation);
router.patch("/documents", alfrescoController.updateDocument);
router.delete("/documents", alfrescoController.deleteDocument);
router.put("/documents/content", rawFileBody, alfrescoController.replaceDocumentContent);
router.patch("/documents/:id", alfrescoController.updateDocument);
router.delete("/documents/:id", alfrescoController.deleteDocument);
router.get("/documents/:id/location", alfrescoController.getDocumentLocation);
router.get("/documents/:id/content", alfrescoController.streamDocumentContent);
router.put("/documents/:id/content", rawFileBody, alfrescoController.replaceDocumentContent);

const apiRouter = express.Router();
apiRouter.get("/health", alfrescoController.health);
apiRouter.use("/alfresco", router);

module.exports = { apiRouter, router };
