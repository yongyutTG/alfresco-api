const alfrescoService = require("./alfresco.service");
const { handleError } = require("../../middlewares/errorHandler");
const { audit } = require("../../utils/auditLogger");

function getUploadedFileFromRequest(req) {
  return {
    buffer: req.body,
    name: req.query.name || req.query.fileName || req.get("x-file-name"),
    mimeType: req.get("content-type") || "application/octet-stream",
  };
}

//ฟังชันตรวจสอบสถานะการเชื่อมต่อกับ Alfresco
async function health(req, res) {
  try {
    const result = await alfrescoService.getHealth();
    res.json(result);
  } catch (err) {
    handleError(res, "ไม่สามารถเชื่อมต่อกับ Alfresco ได้", err);
  }
}
//ฟังชันดึงรายการโฟลเดอร์จาก Alfresco
async function listFolders(req, res) {
  const folderPath = req.query.path || "/";
  try {
    const folders = await alfrescoService.listFolders(folderPath, req.alfrescoAuthHeaders);
    audit(req, "LIST_FOLDERS", {
      folderPath,
      message: `List folders success: ${folders.length} item(s)`,
    });
    res.json(folders);
  } catch (err) {
    audit(req, "LIST_FOLDERS", {
      folderPath,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถรายการโฟลเดอร์จาก Alfresco ได้", err);
  }
}
//ฟังชันดึงโฟลเดอร์ย่อยทุกชั้นจาก path หลัก
async function listFolderTree(req, res) {
  const folderPath = req.query.path || "/";
  try {
    const options = { maxDepth: req.query.maxDepth };
    const result = await alfrescoService.listFolderTree(folderPath, req.alfrescoAuthHeaders, options);
    audit(req, "LIST_FOLDER_TREE", {
      folderPath,
      message: `List folder tree success: ${result.count} item(s)`,
    });
    res.json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, "LIST_FOLDER_TREE", {
      folderPath,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถดึงโฟลเดอร์ย่อยจาก Alfresco ได้", err);
  }
}
//ฟังชันดึงรายการเอกสารจาก Alfresco
async function listDocuments(req, res) {
  const folderPath = req.query.folderPath || req.query.path || "/Sites/tg-saving/documentLibrary";
  const q = req.query.q || req.query.keyword || req.query.name;
  const exactName = req.query.exactName || req.query.fileName;
  try {
    const options = { maxItems: req.query.maxItems, skipCount: req.query.skipCount, exactName, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection };
    const result = await alfrescoService.listOrSearchDocuments(folderPath, q, req.alfrescoAuthHeaders, options);

    audit(req, q || exactName ? "SEARCH_DOCUMENTS" : "LIST_DOCUMENTS", {
      folderPath,
      searchText: q || exactName || null,
      message: `${q || exactName ? "Search" : "List"} documents success: ${result.count} item(s)`,
    });

    res.json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, q || exactName ? "SEARCH_DOCUMENTS" : "LIST_DOCUMENTS", {
      folderPath,
      searchText: q || exactName || null,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถรายการเอกสารจาก Alfresco ได้", err);
  }
}
//ฟังชันค้นหาเอกสารโดยแยก endpoint จาก list เพื่อให้ dev ภายนอกใช้งานชัดเจน
async function searchDocuments(req, res) {
  const folderPath = req.query.folderPath || req.query.path || "/Sites/tg-saving/documentLibrary";
  const q = req.query.q || req.query.keyword || req.query.name;
  const exactName = req.query.exactName || req.query.fileName;
  try {
    if (!q && !exactName) {
      audit(req, "SEARCH_DOCUMENTS", {
        folderPath,
        searchText: null,
        status: "FAILED",
        message: "Missing search parameter: q or exactName is required",
      });
      return res.status(400).json({
        message: "Missing search parameter: q or exactName is required",
        status: 400,
      });
    }

    const options = { maxItems: req.query.maxItems, skipCount: req.query.skipCount, exactName, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection };
    const result = await alfrescoService.searchDocuments(folderPath, q, req.alfrescoAuthHeaders, options);

    audit(req, "SEARCH_DOCUMENTS", {
      folderPath,
      searchText: q || exactName,
      message: `Search documents success: ${result.count} item(s)`,
    });

    res.json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, "SEARCH_DOCUMENTS", {
      folderPath,
      searchText: q || exactName || null,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถค้นหาเอกสารจาก Alfresco ได้", err);
  }
}
//ฟังชันดึงตำแหน่งไฟล์
async function getDocumentLocation(req, res) {
  const documentId = req.params.id || req.query.id;
  try {
    const result = await alfrescoService.getDocumentLocation(documentId, req.alfrescoAuthHeaders);
    audit(req, "VIEW_FILE_DETAIL", {
      documentId,
      folderPath: result.parentPath,
      message: "Get document location success",
    });
    res.json(result);
  } catch (err) {
    audit(req, "VIEW_FILE_DETAIL", {
      documentId,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถดึงตำแหน่งไฟล์จาก Alfresco ได้", err);
  }
}
//ฟังชันแก้ไขข้อมูลเอกสาร ปัจจุบันรองรับการเปลี่ยนชื่อไฟล์ด้วย field name
async function updateDocument(req, res) {
  const documentId = req.params.id || req.query.id;
  try {
    const result = await alfrescoService.updateDocument(documentId, req.body, req.alfrescoAuthHeaders);
    audit(req, "RENAME_FILE", {
      documentId,
      fileName: req.body?.name || req.body?.fileName,
      message: "Rename file success",
    });
    res.json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, "RENAME_FILE", {
      documentId,
      fileName: req.body?.name || req.body?.fileName,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถแก้ไขเอกสารใน Alfresco ได้", err);
  }
}
//ฟังชันอัปโหลดไฟล์ใหม่เข้า folder ที่ระบุ
async function createDocument(req, res) {
  const folderPath = req.query.folderPath || req.query.path || req.get("x-folder-path");
  const file = getUploadedFileFromRequest(req);
  try {
    const result = await alfrescoService.createDocument(folderPath, file, req.alfrescoAuthHeaders);
    audit(req, "UPLOAD_FILE", {
      folderPath: result.path,
      fileName: result.fileName,
      message: "Upload file success",
    });
    res.status(201).json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, "UPLOAD_FILE", {
      folderPath,
      fileName: file.name,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถอัปโหลดเอกสารไปยัง Alfresco ได้", err);
  }
}
//ฟังชันลบไฟล์ตาม document id
async function deleteDocument(req, res) {
  const documentId = req.params.id || req.query.id;
  try {
    const result = await alfrescoService.deleteDocument(documentId, req.alfrescoAuthHeaders);
    audit(req, "DELETE_FILE", {
      documentId,
      fileName: req.query.name,
      message: "Delete file success",
    });
    res.json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, "DELETE_FILE", {
      documentId,
      fileName: req.query.name,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถลบเอกสารใน Alfresco ได้", err);
  }
}
//ฟังชันแทนที่ content ของไฟล์เดิม
async function replaceDocumentContent(req, res) {
  const documentId = req.params.id || req.query.id;
  const file = getUploadedFileFromRequest(req);
  try {
    const result = await alfrescoService.replaceDocumentContent(documentId, file, req.alfrescoAuthHeaders);
    audit(req, "REPLACE_FILE_CONTENT", {
      documentId,
      fileName: result.fileName,
      message: "Replace file content success",
    });
    res.json({
      ...result,
      username: req.alfrescoUsername,
    });
  } catch (err) {
    audit(req, "REPLACE_FILE_CONTENT", {
      documentId,
      fileName: file.name,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถแทนที่เนื้อหาเอกสารใน Alfresco ได้", err);
  }
}
//ฟังชันสตรีมเนื้อหาเอกสารจาก Alfresco
async function streamDocumentContent(req, res) {
  const action = req.query.action === "download" ? "DOWNLOAD_FILE" : "OPEN_FILE";
  try {
    audit(req, action, {
      documentId: req.params.id,
      fileName: req.query.name,
      message: `${action === "DOWNLOAD_FILE" ? "Download" : "Open"} file requested`,
    });
    await alfrescoService.streamDocumentContent(res, req.params.id, req.query.name, req.alfrescoAuthHeaders);
  } catch (err) {
    audit(req, action, {
      documentId: req.params.id,
      fileName: req.query.name,
      status: "FAILED",
      message: err.message,
    });
    handleError(res, "ไม่สามารถดาวน์โหลดเอกสารจาก Alfresco ได้", err);
  }
}

module.exports = {
  createDocument,
  deleteDocument,
  health,
  getDocumentLocation,
  listDocuments,
  listFolderTree,
  listFolders,
  searchDocuments,
  replaceDocumentContent,
  streamDocumentContent,
  updateDocument,
};
