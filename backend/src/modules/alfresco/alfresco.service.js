const alfrescoRepo = require("./alfresco.repo");
const { escapeCmisString, escapeCmisLike, mapCmisObject } = require("../../utils/cmis");

// Service = ชั้น business logic เลือกว่าจะเรียก repo แบบไหน และจัดรูป response กลับไปให้ controller
async function listFolders(folderPath = "/") {
  const items = await alfrescoRepo.getChildrenByPath(folderPath);
  return items.filter((item) => item.isFolder);
}

async function listChildren(folderPath = "/") {
  return alfrescoRepo.getChildrenByPath(folderPath);
}

async function listDocumentsInTree(folderPath, options = {}) {
  const folder = await alfrescoRepo.getObjectByPath(folderPath);
  const maxItems = Math.min(Number(options.maxItems || 1000), 60000);
  const skipCount = Math.max(Number(options.skipCount || 0), 0);
  const query = `SELECT * FROM cmis:document WHERE IN_TREE('${escapeCmisString(folder.id)}')`;
  const data = await alfrescoRepo.queryDocuments(query, { maxItems, skipCount });

  return formatDocumentQueryResult(data, folderPath, folder.id, { maxItems, skipCount });
}

async function searchDocumentsInTree(folderPath, searchText, options = {}) {
  const folder = await alfrescoRepo.getObjectByPath(folderPath);
  const maxItems = Math.min(Number(options.maxItems || 100), 5000);
  const skipCount = Math.max(Number(options.skipCount || 0), 0);
  const normalizedSearchText = String(searchText || "").trim();

  if (!normalizedSearchText) {
    return {
      path: folderPath,
      folderId: folder.id,
      q: normalizedSearchText,
      count: 0,
      total: 0,
      hasMoreItems: false,
      maxItems,
      skipCount,
      files: [],
    };
  }

  const query = [
    "SELECT * FROM cmis:document",
    `WHERE IN_TREE('${escapeCmisString(folder.id)}')`,
    `AND cmis:name LIKE '%${escapeCmisLike(normalizedSearchText)}%'`,
  ].join(" ");
  const data = await alfrescoRepo.queryDocuments(query, {
    searchAllVersions: false,
    maxItems,
    skipCount,
  });

  return {
    ...formatDocumentQueryResult(data, folderPath, folder.id, { maxItems, skipCount }),
    q: normalizedSearchText,
  };
}

async function findDocumentByExactNameInTree(folderPath, exactName, options = {}) {
  const folder = await alfrescoRepo.getObjectByPath(folderPath);
  const maxItems = Math.min(Number(options.maxItems || 100), 5000);
  const skipCount = Math.max(Number(options.skipCount || 0), 0);
  const normalizedExactName = String(exactName || "").trim();

  if (!normalizedExactName) {
    return {
      path: folderPath,
      folderId: folder.id,
      exactName: "",
      count: 0,
      total: 0,
      hasMoreItems: false,
      maxItems,
      skipCount,
      files: [],
    };
  }

  // ใช้ = แทน LIKE เมื่อต้องการค้นชื่อไฟล์เต็มแบบเจาะจง
  // เหมาะกับชื่อไฟล์ที่มี _ หรือ % เพราะจะถูกมองเป็นตัวอักษรจริง ไม่ใช่ wildcard
  const query = [
    "SELECT * FROM cmis:document",
    `WHERE IN_TREE('${escapeCmisString(folder.id)}')`,
    `AND cmis:name = '${escapeCmisString(normalizedExactName)}'`,
  ].join(" ");
  const data = await alfrescoRepo.queryDocuments(query, {
    searchAllVersions: false,
    maxItems,
    skipCount,
  });

  return {
    ...formatDocumentQueryResult(data, folderPath, folder.id, { maxItems, skipCount }),
    exactName: normalizedExactName,
  };
}

async function findDocuments(folderPath, options = {}) {
  if (options.exactName && String(options.exactName).trim()) {
    return findDocumentByExactNameInTree(folderPath, options.exactName, options);
  }

  const q = options.q || options.keyword || options.name;

  return q && String(q).trim()
    ? searchDocumentsInTree(folderPath, q, options)
    : listDocumentsInTree(folderPath, options);
}

async function readObject(id, objectPath) {
  return id ? alfrescoRepo.getObjectById(id) : alfrescoRepo.getObjectByPath(objectPath);
}

async function streamDocumentContent(res, id, name) {
  if (!id || id === "DOCUMENT_ID") {
    return res.status(400).json({
      message: "Missing real document id",
      example: "/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=file.pdf",
    });
  }

  const result = await alfrescoRepo.getDocumentContentStream(id);
  alfrescoRepo.sendContentStream(res, result, name);
}

async function uploadDocument(folderPath, file, name) {
  if (!folderPath || !String(folderPath).trim()) {
    const error = new Error("Missing folderPath");
    error.statusCode = 400;
    throw error;
  }

  if (!file) {
    const error = new Error("Missing file field");
    error.statusCode = 400;
    throw error;
  }

  return alfrescoRepo.createDocument(folderPath, file, name);
}

async function renameDocument(id, name) {
  if (!id) {
    const error = new Error("Missing document id");
    error.statusCode = 400;
    throw error;
  }

  if (!name || !String(name).trim()) {
    const error = new Error("Missing new file name");
    error.statusCode = 400;
    throw error;
  }

  return alfrescoRepo.updateDocumentName(id, name);
}

async function deleteDocument(id) {
  if (!id) {
    const error = new Error("Missing document id");
    error.statusCode = 400;
    throw error;
  }

  return alfrescoRepo.deleteDocument(id);
}

function formatDocumentQueryResult(data, folderPath, folderId, paging) {
  return {
    path: folderPath,
    folderId,
    count: data.results?.length || 0,
    total: data.numItems ?? null,
    hasMoreItems: Boolean(data.hasMoreItems),
    maxItems: paging.maxItems,
    skipCount: paging.skipCount,
    files: (data.results || []).map(mapCmisObject),
  };
}

function withNextSkipCount(result) {
  return {
    ...result,
    nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
  };
}

module.exports = {
  listFolders,
  listChildren,
  listDocumentsInTree,
  searchDocumentsInTree,
  findDocumentByExactNameInTree,
  findDocuments,
  readObject,
  streamDocumentContent,
  uploadDocument,
  renameDocument,
  deleteDocument,
  withNextSkipCount,
};
