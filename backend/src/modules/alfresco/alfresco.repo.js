const axios = require("axios");
const FormData = require("form-data");
const { env } = require("../../config/env");
const { createAlfrescoAuthHeader } = require("../../utils/authHeader");
const { cmisUrlForPath, mapCmisObject, safeFileName } = require("../../utils/cmis");

// Repo = ชั้นที่รับผิดชอบการยิง HTTP ไป Alfresco โดยตรง
async function getServerInfo() {
  const result = await axios.get(`${env.alfrescoHost}/alfresco/service/api/server`, {
    headers: createAlfrescoAuthHeader(),
  });

  return result.data;
}

async function getChildrenByPath(folderPath = "/") {
  const result = await axios.get(cmisUrlForPath(folderPath), {
    headers: createAlfrescoAuthHeader(),
    params: { cmisselector: "children" },
  });

  return (result.data.objects || []).map(mapCmisObject);
}

async function getObjectByPath(objectPath = "/") {
  const result = await axios.get(cmisUrlForPath(objectPath), {
    headers: createAlfrescoAuthHeader(),
    params: { cmisselector: "object" },
  });

  return mapCmisObject(result.data);
}

async function getObjectById(id) {
  const result = await axios.get(`${env.alfrescoCmisUrl}/root`, {
    headers: createAlfrescoAuthHeader(),
    params: {
      cmisselector: "object",
      objectId: id,
    },
  });

  return mapCmisObject(result.data);
}

async function queryDocuments(query, options = {}) {
  const result = await axios.get(env.alfrescoCmisUrl, {
    headers: createAlfrescoAuthHeader(),
    params: {
      cmisselector: "query",
      q: query,
      searchAllVersions: options.searchAllVersions,
      maxItems: options.maxItems,
      skipCount: options.skipCount,
    },
  });

  return result.data;
}

async function getDocumentContentStream(id) {
  return axios.get(`${env.alfrescoCmisUrl}/root`, {
    headers: createAlfrescoAuthHeader(),
    params: {
      cmisselector: "content",
      objectId: id,
    },
    responseType: "stream",
  });
}

async function createDocument(folderPath, file, name) {
  const form = new FormData();
  const fileName = safeFileName(name || file.originalname);

  // CMIS Browser Binding createDocument
  // POST /root/<folderPath> พร้อม cmisaction=createDocument และ content=file
  form.append("cmisaction", "createDocument");
  form.append("propertyId[0]", "cmis:name");
  form.append("propertyValue[0]", fileName);
  form.append("propertyId[1]", "cmis:objectTypeId");
  form.append("propertyValue[1]", "cmis:document");
  form.append("content", file.buffer, {
    filename: fileName,
    contentType: file.mimetype || "application/octet-stream",
    knownLength: file.size,
  });

  const result = await axios.post(cmisUrlForPath(folderPath), form, {
    headers: {
      ...createAlfrescoAuthHeader(),
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return mapCmisObject(result.data);
}

async function updateDocumentName(id, name) {
  const form = new FormData();

  // CMIS Browser Binding update properties
  // ใช้ objectId เพื่อเปลี่ยน cmis:name ของ document
  form.append("cmisaction", "update");
  form.append("objectId", id);
  form.append("propertyId[0]", "cmis:name");
  form.append("propertyValue[0]", safeFileName(name));

  const result = await axios.post(`${env.alfrescoCmisUrl}/root`, form, {
    headers: {
      ...createAlfrescoAuthHeader(),
      ...form.getHeaders(),
    },
  });

  return mapCmisObject(result.data);
}

async function deleteDocument(id) {
  const form = new FormData();

  // CMIS Browser Binding delete object
  form.append("cmisaction", "delete");
  form.append("objectId", id);

  await axios.post(`${env.alfrescoCmisUrl}/root`, form, {
    headers: {
      ...createAlfrescoAuthHeader(),
      ...form.getHeaders(),
    },
  });

  return { deleted: true, id };
}

function sendContentStream(res, result, name) {
  const fileName = safeFileName(name);

  res.setHeader("Content-Type", result.headers["content-type"] || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
  result.data.pipe(res);
}

module.exports = {
  getServerInfo,
  getChildrenByPath,
  getObjectByPath,
  getObjectById,
  queryDocuments,
  getDocumentContentStream,
  createDocument,
  updateDocumentName,
  deleteDocument,
  sendContentStream,
};
