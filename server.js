// Alfresco API Gateway
// โค้ดนี้ทำหน้าที่เป็นตัวกลางระหว่าง Frontend/External Dev กับ Alfresco 4.2.0
// ฝั่งนอกเรียก REST API ของ Node.js แล้ว Node.js จะไปเรียก Alfresco ผ่าน CMIS Browser Binding อีกที
const express = require("express");
const axios = require("axios");
const path = require("path");

// โหลดค่า .env แบบง่าย ๆ เพื่อให้รันกับ Node ตรง ๆ ได้โดยไม่ต้องติดตั้ง dotenv
// ใช้ตั้งค่า ALFRESCO_HOST, ALFRESCO_USER, ALFRESCO_PASS, API_TOKEN, PORT
function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!require("fs").existsSync(envPath)) {
    return;
  }

  const lines = require("fs").readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

// ===== Flow หลักของระบบ =====
// 1) External Dev/Postman เรียก /api/alfresco/* พร้อม Header: Authorization: Bearer <API_TOKEN>
// 2) Dev Frontend เรียก /dev-api/alfresco/* เฉพาะ localhost ไม่ต้องถือ Bearer token ใน browser
// 3) Route handler จะเรียก helper เช่น getChildrenByPath(), queryDocumentsInTree(), searchDocumentsInTree()
// 4) Helper จะยิงไป Alfresco CMIS ด้วย Basic Auth จาก ALFRESCO_USER/ALFRESCO_PASS ใน .env
// 5) mapCmisObject() แปลง response ของ Alfresco ให้อ่านง่าย ก่อนส่งกลับเป็น JSON

// ===== Route map สำหรับอ่านโค้ดเร็ว =====
// GET /api/health
//   -> axios.get(ALFRESCO_HOST/alfresco/service/api/server) ตรวจ version/server status
// GET /api/alfresco/folders?path=...
//   -> getChildrenByPath(path) -> mapCmisObject() -> filter เฉพาะ folder
// GET /api/alfresco/folders/files?path=...
//   -> queryDocumentsInTree(path) -> getObjectByPath(path) -> CMIS query IN_TREE(folderId)
// GET /api/alfresco/documents?folderPath=...
//   -> ถ้าไม่มี q: queryDocumentsInTree(folderPath)
//   -> ถ้ามี q: searchDocumentsInTree(folderPath, q)
// GET /api/alfresco/documents/:id/content?name=...
//   -> streamDocumentContent(res, id, name) เพื่อ stream PDF/content กลับ browser
// GET /dev-api/alfresco/*
//   -> ใช้ helper ชุดเดียวกับ /api/alfresco/* แต่ป้องกันด้วย requireLocalhost แทน Bearer token
const app = express();
const PORT = Number(process.env.PORT || 3000);

const ALFRESCO_HOST = process.env.ALFRESCO_HOST || "http://172.17.1.21";
const ALFRESCO_CMIS = `${ALFRESCO_HOST}/alfresco/api/-default-/public/cmis/versions/1.1/browser`;

// แนะนำให้ย้ายค่าเหล่านี้ไปเป็น environment variables ตอนใช้งานจริง
const ALFRESCO_USER = process.env.ALFRESCO_USER;
const ALFRESCO_PASS = process.env.ALFRESCO_PASS;
const API_TOKEN = process.env.API_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/dev-frontend", requireLocalhost, express.static(path.join(__dirname, "dev-frontend")));
app.use("/api/alfresco", requireBearerToken);

// Middleware สำหรับ /dev-frontend และ /dev-api เท่านั้น
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
// Middleware สำหรับ /api/alfresco/* ที่ external dev/Postman เรียกใช้
// ทุกเส้นใต้ /api/alfresco ต้องส่ง Header: Authorization: Bearer <API_TOKEN>
function requireBearerToken(req, res, next) {
  if (!API_TOKEN) {
    return res.status(500).json({ message: "API_TOKEN is not configured" });
  }

  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || token !== API_TOKEN) {
    return res.status(401).json({ message: "Unauthorized: missing or invalid Bearer token" });
  }

  next();
}
// สร้าง Basic Auth header สำหรับให้ Node.js ไปคุยกับ Alfresco
// ใช้เฉพาะฝั่ง server เท่านั้น ห้ามส่ง ALFRESCO_USER/ALFRESCO_PASS ไปที่ frontend
function authHeader() {
  const token = Buffer.from(`${ALFRESCO_USER}:${ALFRESCO_PASS}`, "utf8").toString("base64");
  return { Authorization: `Basic ${token}` };
}

// แปลง path ของ Alfresco เช่น /Sites/tg-saving/documentLibrary/การเงิน
// ให้เป็น URL แบบ CMIS Browser Binding ที่ Alfresco 4.2.0 รองรับ
function cmisUrlForPath(folderPath = "/") {
  const normalizedPath = String(folderPath || "/").trim();

  if (normalizedPath === "/") {
    return `${ALFRESCO_CMIS}/root`;
  }

  const encodedSegments = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${ALFRESCO_CMIS}/root/${encodedSegments}`;
}

// อ่านค่า property จาก CMIS response เพราะ Alfresco จะห่อค่าไว้ใน properties[key].value
function getProp(properties, key) {
  const value = properties?.[key]?.value ?? null;

  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : value;
  }

  return value;
}

// แปลง object ดิบจาก Alfresco CMIS ให้เป็น JSON รูปแบบที่ frontend/dev อ่านง่าย
// ใช้โดย getChildrenByPath(), queryDocumentsInTree(), searchDocumentsInTree(), getObjectByPath(), getObjectById()
function mapCmisObject(item) {
  const object = item.object || item;
  const props = object.properties || {};
  const type = getProp(props, "cmis:baseTypeId");
  const objectTypeId = getProp(props, "cmis:objectTypeId");
  const name = getProp(props, "cmis:name");
  const id = getProp(props, "cmis:objectId");

  return {
    id,
    name,
    path: getProp(props, "cmis:path"),
    type,
    objectTypeId,
    isFolder: type === "cmis:folder",
    isDocument: type === "cmis:document",
    mimeType: getProp(props, "cmis:contentStreamMimeType"),
    size: getProp(props, "cmis:contentStreamLength"),
    createdBy: getProp(props, "cmis:createdBy"),
    creationDate: getProp(props, "cmis:creationDate"),
    lastModifiedBy: getProp(props, "cmis:lastModifiedBy"),
    lastModificationDate: getProp(props, "cmis:lastModificationDate"),
    title: getProp(props, "cm:title"),
    description: getProp(props, "cm:description") || getProp(props, "cmis:description"),
    downloadUrl:
      type === "cmis:document"
        ? `/api/alfresco/documents/${encodeURIComponent(id)}/content?name=${encodeURIComponent(name || "download")}`
        : null,
  };
}

// ทำ error จาก axios ให้ส่งกลับเป็น JSON ได้อย่างปลอดภัย
// สำคัญ: กันปัญหา circular structure จาก response stream/socket
function safeErrorData(err) {
  const data = err.response?.data;

  if (!data) {
    return err.message;
  }

  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (data.status || data.message || data.exception) {
    return data;
  }

  // Axios stream errors can contain sockets/circular refs, so keep the response small.
  return {
    message: err.message,
    contentType: err.response?.headers?.["content-type"],
  };
}

// รูปแบบกลางสำหรับตอบ error ทุก route
function handleError(res, message, err) {
  const status = err.response?.status || 500;

  res.status(status).json({
    message,
    status,
    error: safeErrorData(err),
  });
}

// เรียกลูกของ folder ตาม path ที่ส่งมา
// ใช้กับ route: /api/alfresco/folders, /api/alfresco/children, /api/alfresco/root, /api/alfresco/sites, /dev-api/alfresco/folders
async function getChildrenByPath(folderPath = "/") {
  const result = await axios.get(cmisUrlForPath(folderPath), {
    headers: authHeader(),
    params: {
      cmisselector: "children",
    },
  });

  return (result.data.objects || []).map(mapCmisObject);
}

// เดินอ่านไฟล์แบบ recursive ด้วยการไล่ children ทีละ folder
// ตอนนี้ไม่ได้ใช้กับ RESTful route หลักแล้ว เพราะเปลี่ยนมาใช้ CMIS query IN_TREE ที่เร็วกว่า
async function getFilesRecursive(folderPath, options = {}) {
  const maxDepth = Number(options.maxDepth ?? 20);
  const files = [];

  async function walk(currentPath, depth) {
    if (depth > maxDepth) {
      return;
    }

    const items = await getChildrenByPath(currentPath);

    for (const item of items) {
      if (item.isDocument) {
        files.push(item);
        continue;
      }

      if (item.isFolder && item.path) {
        await walk(item.path, depth + 1);
      }
    }
  }

  await walk(folderPath, 0);
  return files;
}

// escape เครื่องหมาย single quote ใน CMIS query เพื่อกัน query พัง
function escapeCmisString(value) {
  return String(value).replace(/'/g, "''");
}

// escape keyword สำหรับใช้กับ CMIS LIKE เช่น %, _, backslash
function escapeCmisLike(value) {
  return escapeCmisString(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ดึงเอกสารทั้งหมดใต้ folderPath รวมเอกสารใน subfolder
// ใช้กับ route: /api/alfresco/folders/files, /api/alfresco/documents เมื่อไม่มี q, /dev-api/alfresco/documents เมื่อไม่มี q
async function queryDocumentsInTree(folderPath, options = {}) {
  const folder = await getObjectByPath(folderPath);
  const maxItems = Math.min(Number(options.maxItems || 1000), 60000);
  const skipCount = Math.max(Number(options.skipCount || 0), 0);
  const query = `SELECT * FROM cmis:document WHERE IN_TREE('${escapeCmisString(folder.id)}')`;

  const result = await axios.get(ALFRESCO_CMIS, {
    headers: authHeader(),
    params: {
      cmisselector: "query",
      q: query,
      maxItems,
      skipCount,
    },
  });

  return {
    path: folderPath,
    folderId: folder.id,
    count: result.data.results?.length || 0,
    total: result.data.numItems ?? null,
    hasMoreItems: Boolean(result.data.hasMoreItems),
    maxItems,
    skipCount,
    files: (result.data.results || []).map(mapCmisObject),
  };
}

// ค้นหาเอกสารใต้ folderPath จากชื่อไฟล์ด้วย q/keyword/name
// ใช้กับ route: /api/alfresco/documents เมื่อมี q, /api/alfresco/search-files, /dev-api/alfresco/documents เมื่อมี q
async function searchDocumentsInTree(folderPath, searchText, options = {}) {
  const folder = await getObjectByPath(folderPath);
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

  const result = await axios.get(ALFRESCO_CMIS, {
    headers: authHeader(),
    params: {
      cmisselector: "query",
      q: query,
      searchAllVersions: false,
      maxItems,
      skipCount,
    },
  });

  return {
    path: folderPath,
    folderId: folder.id,
    q: normalizedSearchText,
    count: result.data.results?.length || 0,
    total: result.data.numItems ?? null,
    hasMoreItems: Boolean(result.data.hasMoreItems),
    maxItems,
    skipCount,
    files: (result.data.results || []).map(mapCmisObject),
  };
}

// อ่าน metadata ของ object/folder จาก path
// ใช้ก่อน queryDocumentsInTree/searchDocumentsInTree เพื่อหา folderId สำหรับ CMIS IN_TREE(folderId)
async function getObjectByPath(objectPath = "/") {
  const result = await axios.get(cmisUrlForPath(objectPath), {
    headers: authHeader(),
    params: {
      cmisselector: "object",
    },
  });

  return mapCmisObject(result.data);
}

// อ่าน metadata ของ object จาก id
// ใช้กับ legacy route: /api/alfresco/object?id=...
async function getObjectById(id) {
  const result = await axios.get(`${ALFRESCO_CMIS}/root`, {
    headers: authHeader(),
    params: {
      cmisselector: "object",
      objectId: id,
    },
  });

  return mapCmisObject(result.data);
}

// ดาวน์โหลด/เปิด content ของ document จาก document id
// ใช้กับ route: /api/alfresco/documents/:id/content, /api/alfresco/content, /dev-api/alfresco/documents/:id/content
async function streamDocumentContent(res, id, name) {
  if (!id || id === "DOCUMENT_ID") {
    return res.status(400).json({
      message: "Missing real document id",
      example: "/api/alfresco/documents/7b815e16-a594-4864-9665-cfda64e8d880%3B1.0/content?name=file.pdf",
    });
  }

  const result = await axios.get(`${ALFRESCO_CMIS}/root`, {
    headers: authHeader(),
    params: {
      cmisselector: "content",
      objectId: id,
    },
    responseType: "stream",
  });

  const fileName = path.basename(name || "download");

  res.setHeader("Content-Type", result.headers["content-type"] || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);

  result.data.pipe(res);
}

// หน้าเว็บหลักสำหรับเลือกโฟลเดอร์ ค้นหา และเปิดไฟล์จาก Alfresco
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Dev frontend proxy: ใช้เฉพาะ localhost สำหรับหน้า /dev-frontend เท่านั้น
// Browser ไม่ต้องถือ Bearer token เอง ส่วน external dev ให้เรียก /api/alfresco/* พร้อม Bearer token
app.get("/dev-api/alfresco/folders", requireLocalhost, async (req, res) => {
  try {
    const folderPath = req.query.path || "/";
    const items = await getChildrenByPath(folderPath);
    res.json(items.filter((item) => item.isFolder));
  } catch (err) {
    handleError(res, "Cannot list Alfresco folders", err);
  }
});

app.get("/dev-api/alfresco/documents", requireLocalhost, async (req, res) => {
  try {
    const folderPath = req.query.folderPath || req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const q = req.query.q || req.query.keyword || req.query.name;
    const options = {
      maxItems: req.query.maxItems,
      skipCount: req.query.skipCount,
    };

    const result = q && String(q).trim()
      ? await searchDocumentsInTree(folderPath, q, options)
      : await queryDocumentsInTree(folderPath, options);

    res.json({
      ...result,
      files: result.files.map((file) => ({
        ...file,
        downloadUrl: file.downloadUrl
          ? file.downloadUrl.replace("/api/alfresco/", "/dev-api/alfresco/")
          : null,
      })),
      nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
    });
  } catch (err) {
    handleError(res, "Cannot list Alfresco documents", err);
  }
});

app.get("/dev-api/alfresco/documents/:id/content", requireLocalhost, async (req, res) => {
  try {
    await streamDocumentContent(res, req.params.id, req.query.name);
  } catch (err) {
    handleError(res, "Cannot download Alfresco document", err);
  }
});
// ตรวจสอบว่า Node API เชื่อมต่อ Alfresco server ได้ และแสดง version ของ Alfresco
app.get("/api/health", async (req, res) => {
  try {
    const result = await axios.get(`${ALFRESCO_HOST}/alfresco/service/api/server`, {
      headers: authHeader(),
    });

    res.json({ ok: true, alfresco: result.data });
  } catch (err) {
    handleError(res, "Cannot connect to Alfresco", err);
  }
});

// RESTful: แสดงรายการโฟลเดอร์ย่อยใต้ path ที่ส่งมา เช่น documentLibrary
// GET /api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
app.get("/api/alfresco/folders", async (req, res) => {
  try {
    const folderPath = req.query.path || "/";
    const items = await getChildrenByPath(folderPath);
    res.json(items.filter((item) => item.isFolder));
  } catch (err) {
    handleError(res, "Cannot list Alfresco folders", err);
  }
});

// RESTful: แสดงไฟล์ทั้งหมดใต้โฟลเดอร์ที่ระบุ รวมไฟล์ในโฟลเดอร์ย่อย ใช้แบ่งหน้าด้วย maxItems/skipCount
// GET /api/alfresco/folders/files?path=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100
app.get("/api/alfresco/folders/files", async (req, res) => {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const result = await queryDocumentsInTree(folderPath, {
      maxItems: req.query.maxItems,
      skipCount: req.query.skipCount,
    });

    res.json({
      ...result,
      nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
    });
  } catch (err) {
    handleError(res, "Cannot list Alfresco folder files", err);
  }
});

// RESTful: แสดงหรือค้นหาเอกสารในโฟลเดอร์ที่ระบุ ถ้ามี q จะค้นจากชื่อไฟล์
// GET /api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277
app.get("/api/alfresco/documents", async (req, res) => {
  try {
    const folderPath = req.query.folderPath || req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const q = req.query.q || req.query.keyword || req.query.name;
    const options = {
      maxItems: req.query.maxItems,
      skipCount: req.query.skipCount,
    };

    const result = q && String(q).trim()
      ? await searchDocumentsInTree(folderPath, q, options)
      : await queryDocumentsInTree(folderPath, options);

    res.json({
      ...result,
      nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
    });
  } catch (err) {
    handleError(res, "Cannot list Alfresco documents", err);
  }
});

// RESTful: ดาวน์โหลดหรือเปิดเนื้อหาไฟล์ตาม document id
// GET /api/alfresco/documents/:id/content?name=file.pdf
app.get("/api/alfresco/documents/:id/content", async (req, res) => {
  try {
    await streamDocumentContent(res, req.params.id, req.query.name);
  } catch (err) {
    handleError(res, "Cannot download Alfresco document", err);
  }
});
// Legacy: แสดงรายการ item ที่ root ของ Alfresco repository
app.get("/api/alfresco/root", async (req, res) => {
  try {
    const items = await getChildrenByPath("/");
    res.json(items);
  } catch (err) {
    handleError(res, "Cannot read Alfresco root", err);
  }
});

// Legacy: แสดงรายการ site ใต้ /Sites
app.get("/api/alfresco/sites", async (req, res) => {
  try {
    const items = await getChildrenByPath("/Sites");
    res.json(items);
  } catch (err) {
    handleError(res, "Cannot read Alfresco sites", err);
  }
});

// Legacy: แสดงรายการ item ใต้ path ที่ส่งมา ทั้ง folder และ document
app.get("/api/alfresco/children", async (req, res) => {
  try {
    const folderPath = req.query.path || "/";
    const items = await getChildrenByPath(folderPath);
    res.json(items);
  } catch (err) {
    handleError(res, "Cannot read Alfresco folder", err);
  }
});

// Legacy: แสดงไฟล์ทั้งหมดใต้ path ที่ส่งมา รวมไฟล์ในโฟลเดอร์ย่อย
app.get("/api/alfresco/files", async (req, res) => {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const result = await queryDocumentsInTree(folderPath, {
      maxItems: req.query.maxItems,
      skipCount: req.query.skipCount,
    });

    res.json(result);
  } catch (err) {
    handleError(res, "Cannot list Alfresco files", err);
  }
});

// Legacy: แสดงเฉพาะชื่อไฟล์ใต้ path ที่ส่งมา
app.get("/api/alfresco/file-names", async (req, res) => {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const result = await queryDocumentsInTree(folderPath, {
      maxItems: req.query.maxItems,
      skipCount: req.query.skipCount,
    });

    res.json({
      path: result.path,
      count: result.count,
      total: result.total,
      hasMoreItems: result.hasMoreItems,
      maxItems: result.maxItems,
      skipCount: result.skipCount,
      nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
      names: result.files.map((file) => file.name),
    });
  } catch (err) {
    handleError(res, "Cannot list Alfresco file names", err);
  }
});

// Legacy: ค้นหาไฟล์จากชื่อไฟล์ใต้ path ที่ส่งมา
app.get("/api/alfresco/search-files", async (req, res) => {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const q = req.query.q || req.query.keyword || req.query.name;

    if (!q || !String(q).trim()) {
      return res.status(400).json({
        message: "Missing search keyword",
        example: "/api/alfresco/search-files?path=/Sites/tg-saving/documentLibrary/การเงิน&q=ATM",
      });
    }

    const result = await searchDocumentsInTree(folderPath, q, {
      maxItems: req.query.maxItems,
      skipCount: req.query.skipCount,
    });

    res.json({
      ...result,
      nextSkipCount: result.hasMoreItems ? result.skipCount + result.count : null,
    });
  } catch (err) {
    handleError(res, "Cannot search Alfresco files", err);
  }
});

// Legacy: อ่าน metadata ของ object ด้วย id หรือ path
app.get("/api/alfresco/object", async (req, res) => {
  try {
    const { id, path: objectPath } = req.query;

    if (!id && !objectPath) {
      return res.status(400).json({ message: "Missing id or path" });
    }

    const object = id ? await getObjectById(id) : await getObjectByPath(objectPath);
    res.json(object);
  } catch (err) {
    handleError(res, "Cannot read Alfresco object", err);
  }
});

// Legacy: ดาวน์โหลดหรือเปิดเนื้อหาไฟล์ด้วย query id
app.get("/api/alfresco/content", async (req, res) => {
  try {
    await streamDocumentContent(res, req.query.id, req.query.name);
  } catch (err) {
    handleError(res, "Cannot download Alfresco file", err);
  }
});

app.listen(PORT, () => {
  console.log(`Node API running at http://localhost:${PORT}`);
  console.log(`Alfresco server: ${ALFRESCO_HOST}`);
});















