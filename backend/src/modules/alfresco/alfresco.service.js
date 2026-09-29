const alfrescoRepo = require("./alfresco.repo");
const { env: config } = require("../../config/env");
const { escapeCmisLike, escapeCmisString, mapCmisObject } = require("../../utils/cmis");
const { parseOffset, parsePositiveInteger } = require("../../utils/pagination");

function getListPaging(options = {}) {
  return {
    maxItems: parsePositiveInteger(options.maxItems, config.defaultMaxItems, config.maxListItems),
    skipCount: parseOffset(options.skipCount),
  };
}

function getSearchPaging(options = {}) {
  return {
    maxItems: parsePositiveInteger(options.maxItems, config.defaultMaxItems, config.maxSearchItems),
    skipCount: parseOffset(options.skipCount),
  };
}

function getDocumentSortClause(options = {}) {
  const sortBy = String(options.sortBy || options.sortField || "").trim().toLowerCase();
  const directionValue = String(options.sortDirection || options.order || "").trim().toLowerCase();
  const direction = directionValue === "asc" ? "ASC" : directionValue === "desc" ? "DESC" : null;

  if (!sortBy || !direction) return "";

  const sortFieldMap = {
    name: "cmis:name",
    filename: "cmis:name",
    created: "cmis:creationDate",
    creationdate: "cmis:creationDate",
  };
  const field = sortFieldMap[sortBy];

  return field ? ` ORDER BY ${field} ${direction}` : "";
}

function normalizeRepositoryPath(repositoryPath) {
  if (!repositoryPath) return null;
  return String(repositoryPath).replace(/^\/Company Home(?=\/|$)/, "") || "/";
}

function joinRepositoryPath(parentPath, childName) {
  const parent = String(parentPath || "/").replace(/\/+$/, "");
  const child = String(childName || "").trim();

  if (!child) return parent || "/";
  if (!parent || parent === "/") return `/${child}`;
  return `${parent}/${child}`;
}

function normalizePathForCompare(repositoryPath) {
  const value = String(repositoryPath || "/").trim().replace(/\/+$/, "");
  return value || "/";
}

function getPathDepthFromRoot(repositoryPath, rootPath) {
  const normalizedPath = normalizePathForCompare(repositoryPath);
  const normalizedRoot = normalizePathForCompare(rootPath);

  if (normalizedPath === normalizedRoot) return 0;
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return null;

  return normalizedPath
    .slice(normalizedRoot.length + 1)
    .split("/")
    .filter(Boolean)
    .length;
}

function buildFolderTreeFromFlatFolders(folders, rootPath) {
  const normalizedRoot = normalizePathForCompare(rootPath);
  const nodesByPath = new Map();
  const tree = [];

  for (const folder of folders) {
    nodesByPath.set(normalizePathForCompare(folder.path), {
      ...folder,
      children: [],
    });
  }

  for (const node of nodesByPath.values()) {
    const normalizedPath = normalizePathForCompare(node.path);
    const parentPath = normalizePathForCompare(normalizedPath.slice(0, normalizedPath.lastIndexOf("/")) || "/");

    if (parentPath === normalizedRoot || !nodesByPath.has(parentPath)) {
      tree.push(node);
    } else {
      nodesByPath.get(parentPath).children.push(node);
    }
  }

  return tree;
}

function getExactFileNameCandidates(fileName) {
  const normalizedFileName = String(fileName || "").trim();
  if (!normalizedFileName) return [];

  const candidates = [normalizedFileName];

  if (!/\.[^./\\]+$/.test(normalizedFileName)) {
    candidates.push(`${normalizedFileName}.pdf`);
  }

  return [...new Set(candidates)];
}

function createBadRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeDocumentName(name) {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    throw createBadRequest("Missing document name");
  }

  if (/[\\/]/.test(normalizedName)) {
    throw createBadRequest("Document name must not contain path separators");
  }

  return normalizedName;
}

function normalizeUploadedFile(file = {}) {
  const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : null;
  const name = normalizeDocumentName(file.name || file.fileName);
  const mimeType = String(file.mimeType || "application/octet-stream").trim() || "application/octet-stream";

  if (!buffer || buffer.length === 0) {
    throw createBadRequest("Missing file content");
  }

  return {
    buffer,
    name,
    mimeType,
    size: buffer.length,
  };
}

//ฟังชันตรวจสอบสถานะการเชื่อมต่อกับ Alfresco
async function getHealth() {
  const alfresco = await alfrescoRepo.getServerInfo();
  return { ok: true, mode: "service-account", alfresco };
}
//ฟังชันดึงรายการโฟลเดอร์จาก Alfresco
async function listFolders(folderPath, headers) {
  const items = await alfrescoRepo.getChildrenByPath(folderPath || "/", headers);
  return items.filter((item) => item.isFolder);
}

async function collectFolderTreeByChildren(rootPath, headers, maxDepth) {
  const folders = [];
  const errors = [];

  async function walk(parentPath, depth) {
    if (depth > maxDepth) return;

    let children = [];
    try {
      children = await listFolders(parentPath, headers);
    } catch (error) {
      errors.push({
        path: parentPath,
        message: error.message,
        status: error.response?.status || error.statusCode || null,
      });
      return;
    }

    for (const child of children) {
      const childPath = child.path || joinRepositoryPath(parentPath, child.name);
      folders.push({
        ...child,
        path: childPath,
        depth,
      });

      await walk(childPath, depth + 1);
    }
  }

  await walk(rootPath, 1);

  return {
    folders,
    errors,
  };
}
//ฟังชันดึงโฟลเดอร์ย่อยทุกชั้นจาก path หลักด้วย CMIS query ครั้งเดียว เพื่อลดปัญหา timeout จากการวนเรียก children หลายรอบ
async function listFolderTree(folderPath, headers, options = {}) {
  const rootPath = folderPath || "/";
  const maxDepth = parsePositiveInteger(options.maxDepth, 10, 30);
  const rootFolder = await alfrescoRepo.getObjectByPath(rootPath, headers);
  let folders = [];
  let errors = [];
  let total = null;
  let hasMoreItems = false;
  let source = "cmis-query";

  try {
    const query = `SELECT * FROM cmis:folder WHERE IN_TREE('${escapeCmisString(rootFolder.id)}')`;
    const data = await alfrescoRepo.queryDocuments(query, headers, {
      searchAllVersions: false,
      maxItems: config.maxListItems,
      skipCount: 0,
    });

    folders = (data.results || [])
      .map((item) => mapCmisObject(item))
      .filter((folder) => folder.isFolder && folder.path)
      .map((folder) => ({
        ...folder,
        depth: getPathDepthFromRoot(folder.path, rootPath),
      }))
      .filter((folder) => folder.depth && folder.depth <= maxDepth);

    total = data.numItems ?? null;
    hasMoreItems = Boolean(data.hasMoreItems);
  } catch (error) {
    source = "children-fallback";
    errors.push({
      path: rootPath,
      message: `CMIS folder query failed, fallback to children: ${error.message}`,
      status: error.response?.status || error.statusCode || null,
    });

    const fallback = await collectFolderTreeByChildren(rootPath, headers, maxDepth);
    folders = fallback.folders;
    errors = [...errors, ...fallback.errors];
    total = folders.length;
    hasMoreItems = false;
  }

  folders = folders.sort((a, b) => normalizePathForCompare(a.path).localeCompare(normalizePathForCompare(b.path), "th"));

  const tree = buildFolderTreeFromFlatFolders(folders, rootPath);

  return {
    path: rootPath,
    folderId: rootFolder.id,
    maxDepth,
    count: folders.length,
    total,
    hasMoreItems,
    skippedCount: 0,
    source,
    errors,
    folders,
    tree,
  };
}
//ฟังชันดึงรายการเอกสารจาก Alfresco ตาม path และ query
async function queryDocumentsInTree(folderPath, headers, options = {}) {
  const folder = await alfrescoRepo.getObjectByPath(folderPath, headers);
  const { maxItems, skipCount } = getListPaging(options);
  const query = `SELECT * FROM cmis:document WHERE IN_TREE('${escapeCmisString(folder.id)}')${getDocumentSortClause(options)}`;
  const data = await alfrescoRepo.queryDocuments(query, headers, { maxItems, skipCount });
  const files = (data.results || []).map((item) => mapCmisObject(item));

  return {
    path: folderPath,
    folderId: folder.id,
    count: data.results?.length || 0,
    total: data.numItems ?? null,
    hasMoreItems: Boolean(data.hasMoreItems),
    maxItems,
    skipCount,
    files,
  };
}
//ฟังชันค้นหาเอกสารใน Alfresco ตาม path และ query
async function searchDocumentsInTree(folderPath, searchText, headers, options = {}) {
  const folder = await alfrescoRepo.getObjectByPath(folderPath, headers);
  const { maxItems, skipCount } = getSearchPaging(options);
  const normalizedSearchText = String(searchText || "").trim();

  if (!normalizedSearchText) {
    return { path: folderPath, folderId: folder.id, q: "", count: 0, total: 0, hasMoreItems: false, maxItems, skipCount, files: [] };
  }
//ฟังชันสร้าง query สำหรับค้นหาเอกสารใน Alfresco
  const query = [
    "SELECT * FROM cmis:document",
    `WHERE IN_TREE('${escapeCmisString(folder.id)}')`,
    `AND cmis:name LIKE '%${escapeCmisLike(normalizedSearchText)}%'`,
  ].join(" ") + getDocumentSortClause(options);
  //ฟังชันเรียกใช้ alfrescoRepo.queryDocuments
  const data = await alfrescoRepo.queryDocuments(query, headers, { searchAllVersions: false, maxItems, skipCount });
  const files = (data.results || []).map((item) => mapCmisObject(item));

  return {
    path: folderPath,
    folderId: folder.id,
    q: normalizedSearchText,
    count: data.results?.length || 0,
    total: data.numItems ?? null,
    hasMoreItems: Boolean(data.hasMoreItems),
    maxItems,
    skipCount,
    files,
  };
}
//ฟังชันค้นหาเอกสารแบบชื่อไฟล์ตรงตัว เช่น 23017_116969.pdf
async function findDocumentByExactNameInTree(folderPath, exactName, headers, options = {}) {
  const folder = await alfrescoRepo.getObjectByPath(folderPath, headers);
  const { maxItems, skipCount } = getSearchPaging(options);
  const exactNameCandidates = getExactFileNameCandidates(exactName);

  if (!exactNameCandidates.length) {
    return { path: folderPath, folderId: folder.id, exactName: "", count: 0, total: 0, hasMoreItems: false, maxItems, skipCount, files: [] };
  }

  //ฟังชันสร้าง query สำหรับค้นชื่อไฟล์ตรงตัวใน Alfresco
  //ใช้ = แทน LIKE เพื่อให้ _ หรือ % ถูกมองเป็นตัวอักษรจริง ไม่ใช่ wildcard
  const exactNameFilter = exactNameCandidates
    .map((name) => `cmis:name = '${escapeCmisString(name)}'`)
    .join(" OR ");
  const query = [
    "SELECT * FROM cmis:document",
    `WHERE IN_TREE('${escapeCmisString(folder.id)}')`,
    `AND (${exactNameFilter})`,
  ].join(" ") + getDocumentSortClause(options);

  const data = await alfrescoRepo.queryDocuments(query, headers, { searchAllVersions: false, maxItems, skipCount });
  const files = (data.results || []).map((item) => mapCmisObject(item));

  return {
    path: folderPath,
    folderId: folder.id,
    exactName: exactNameCandidates[0],
    exactNameCandidates,
    count: data.results?.length || 0,
    total: data.numItems ?? null,
    hasMoreItems: Boolean(data.hasMoreItems),
    maxItems,
    skipCount,
    files,
  };
}
//ฟังชันดึงรายการเอกสารจาก Alfresco ตาม path และ query หรือค้นหาเอกสาร
async function listOrSearchDocuments(folderPath, q, headers, options = {}) {
  let result;

  if (options.exactName && String(options.exactName).trim()) {
    result = await findDocumentByExactNameInTree(folderPath, options.exactName, headers, options);
  } else if (q && String(q).trim()) {
    result = await searchDocumentsInTree(folderPath, q, headers, options);
  } else {
    result = await queryDocumentsInTree(folderPath, headers, options);
  }

  return {
    ...result,
    nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
  };
}
//ฟังชันค้นหาเอกสารสำหรับ endpoint /documents/search โดยเฉพาะ
async function searchDocuments(folderPath, q, headers, options = {}) {
  let result;

  if (options.exactName && String(options.exactName).trim()) {
    result = await findDocumentByExactNameInTree(folderPath, options.exactName, headers, options);
  } else {
    result = await searchDocumentsInTree(folderPath, q, headers, options);
  }

  return {
    ...result,
    nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
  };
}
//ฟังชันดึงตำแหน่งไฟล์จาก Alfresco ตาม id
async function getDocumentLocation(id, headers) {
  if (!id || id === "DOCUMENT_ID") {
    const error = new Error("Missing real document id");
    error.statusCode = 400;
    throw error;
  }

  try {
    const nodePath = normalizeRepositoryPath(await alfrescoRepo.getNodePathByObjectId(id, headers));

    if (nodePath) {
      return {
        id,
        parentPath: nodePath,
        source: "nodes-api",
      };
    }
  } catch (error) {
    // ถ้า REST nodes API ไม่รองรับ id รูปแบบนี้ ให้ลอง CMIS parents ต่อ
  }

  try {
    const parents = await alfrescoRepo.getObjectParents(id, headers);
    const parentPath = normalizeRepositoryPath(parents.find((parent) => parent.path)?.path);

    return {
      id,
      parentPath,
      source: parentPath ? "cmis-parents" : null,
    };
  } catch (error) {
    return {
      id,
      parentPath: null,
      source: null,
    };
  }

  return {
    id,
    parentPath: null,
    source: null,
  };
}
//ฟังชันแก้ไขเอกสาร ปัจจุบันใช้สำหรับ rename เอกสารผ่าน CMIS updateProperties
async function updateDocument(id, payload = {}, headers) {
  if (!id || id === "DOCUMENT_ID") {
    throw createBadRequest("Missing real document id");
  }

  const name = normalizeDocumentName(payload.name || payload.fileName);
  const updatedObject = await alfrescoRepo.updateDocumentProperties(id, { name }, headers);

  return {
    id,
    updated: true,
    document: updatedObject,
  };
}
//ฟังชันอัปโหลดเอกสารใหม่เข้า folder ที่ระบุ
async function createDocument(folderPath, file, headers) {
  const targetFolderPath = folderPath || "/Sites/tg-saving/documentLibrary";
  const uploadedFile = normalizeUploadedFile(file);
  const createdObject = await alfrescoRepo.createDocument(targetFolderPath, uploadedFile, headers);

  return {
    created: true,
    path: targetFolderPath,
    fileName: uploadedFile.name,
    size: uploadedFile.size,
    document: createdObject,
  };
}
//ฟังชันลบเอกสารตาม id
async function deleteDocument(id, headers) {
  if (!id || id === "DOCUMENT_ID") {
    throw createBadRequest("Missing real document id");
  }

  await alfrescoRepo.deleteDocument(id, headers);

  return {
    id,
    deleted: true,
  };
}
//ฟังชันแทนที่ content ของเอกสารเดิม
async function replaceDocumentContent(id, file, headers) {
  if (!id || id === "DOCUMENT_ID") {
    throw createBadRequest("Missing real document id");
  }

  const uploadedFile = normalizeUploadedFile(file);
  const updatedObject = await alfrescoRepo.setDocumentContentStream(id, uploadedFile, headers);

  return {
    id,
    updatedContent: true,
    fileName: uploadedFile.name,
    size: uploadedFile.size,
    document: updatedObject,
  };
}
//ฟังชันสตรีมเนื้อหาเอกสารจาก Alfresco
async function streamDocumentContent(res, id, name, headers) {
  if (!id || id === "DOCUMENT_ID") {
    return res.status(400).json({ message: "Missing real document id" });
  }
//ฟังชันเรียกใช้ alfrescoRepo.getDocumentContentStream และ alfrescoRepo.safeFileName
  const result = await alfrescoRepo.getDocumentContentStream(id, headers);
  const fileName = alfrescoRepo.safeFileName(name);

  res.setHeader("Content-Type", result.headers["content-type"] || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
  result.data.pipe(res);
}

module.exports = {
  createDocument,
  deleteDocument,
  getHealth,
  findDocumentByExactNameInTree,
  getDocumentLocation,
  listFolderTree,
  listFolders,
  listOrSearchDocuments,
  queryDocumentsInTree,
  searchDocuments,
  searchDocumentsInTree,
  replaceDocumentContent,
  streamDocumentContent,
  updateDocument,
};
