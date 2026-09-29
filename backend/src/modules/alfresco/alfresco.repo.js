const axios = require("axios");
const path = require("path");
const { Blob } = require("buffer");
const { env: config } = require("../../config/env");
const { cmisUrlForPath, mapCmisObject } = require("../../utils/cmis");

const alfrescoHttp = axios.create({
  timeout: config.alfrescoRequestTimeoutMs,
});
const parentPathTimeoutMs = Math.min(config.alfrescoRequestTimeoutMs, 6000);

//ฟังชันดึงข้อมูลเซิร์ฟเวอร์ Alfresco
async function getServerInfo() {
  const result = await alfrescoHttp.get(`${config.alfrescoHost}/alfresco/service/api/server`);
  return result.data;
}
//ฟังชันดึงรายการโฟลเดอร์และเอกสารจาก Alfresco ตาม path
async function getChildrenByPath(folderPath, headers) {
  const result = await alfrescoHttp.get(cmisUrlForPath(folderPath), {
    headers,
    params: { cmisselector: "children", includeAllowableActions: true },
  });

  return (result.data.objects || []).map((item) => mapCmisObject(item));
}
//ฟังชันดึงข้อมูลเอกสารจาก Alfresco ตาม path
async function getObjectByPath(objectPath, headers) {
  const result = await alfrescoHttp.get(cmisUrlForPath(objectPath), {
    headers,
    params: { cmisselector: "object", includeAllowableActions: true },
  });

  return mapCmisObject(result.data);
}
//ฟังชันดึงข้อมูล object จาก Alfresco ตาม CMIS objectId
async function getObjectById(objectId, headers) {
  const result = await alfrescoHttp.get(`${config.alfrescoCmis}/root`, {
    headers,
    params: { cmisselector: "object", objectId, includeAllowableActions: true },
  });

  return mapCmisObject(result.data);
}
//ฟังชันค้นหาเอกสารใน Alfresco ตาม query
async function queryDocuments(query, headers, options = {}) {
  const result = await alfrescoHttp.get(config.alfrescoCmis, {
    headers,
    params: {
      cmisselector: "query",
      q: query,
      searchAllVersions: options.searchAllVersions,
      includeAllowableActions: true,
      maxItems: options.maxItems,
      skipCount: options.skipCount,
    },
  });

  return result.data;
}
//ฟังชันแก้ไข properties ของเอกสารผ่าน CMIS Browser Binding
async function updateDocumentProperties(objectId, properties, headers) {
  const form = new URLSearchParams();
  form.set("cmisaction", "update");
  form.set("objectId", objectId);

  if (properties.name) {
    form.set("propertyId[0]", "cmis:name");
    form.set("propertyValue[0]", properties.name);
  }

  await alfrescoHttp.post(`${config.alfrescoCmis}/root`, form, {
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return getObjectById(objectId, headers);
}
//ฟังชันสร้างเอกสารใหม่ใน folder ผ่าน CMIS Browser Binding
async function createDocument(folderPath, file, headers) {
  const form = new FormData();
  form.set("cmisaction", "createDocument");
  form.set("propertyId[0]", "cmis:objectTypeId");
  form.set("propertyValue[0]", "cmis:document");
  form.set("propertyId[1]", "cmis:name");
  form.set("propertyValue[1]", file.name);
  form.set("content", new Blob([file.buffer], { type: file.mimeType }), file.name);

  const result = await alfrescoHttp.post(cmisUrlForPath(folderPath), form, {
    headers,
  });

  return mapCmisObject(result.data);
}
//ฟังชันลบเอกสารผ่าน CMIS Browser Binding
async function deleteDocument(objectId, headers) {
  const form = new URLSearchParams();
  form.set("cmisaction", "delete");
  form.set("objectId", objectId);
  form.set("allVersions", "true");

  await alfrescoHttp.post(`${config.alfrescoCmis}/root`, form, {
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}
//ฟังชันแทนที่ content ของเอกสารเดิมผ่าน CMIS Browser Binding
async function setDocumentContentStream(objectId, file, headers) {
  const form = new FormData();
  form.set("cmisaction", "setContentStream");
  form.set("objectId", objectId);
  form.set("overwriteFlag", "true");
  form.set("content", new Blob([file.buffer], { type: file.mimeType }), file.name);

  const result = await alfrescoHttp.post(`${config.alfrescoCmis}/root`, form, {
    headers,
  });

  return mapCmisObject(result.data);
}
//ฟังชันดึง parent folder ของเอกสารจาก Alfresco ตาม objectId
async function getObjectParents(objectId, headers) {
  const result = await alfrescoHttp.get(`${config.alfrescoCmis}/root`, {
    headers,
    timeout: parentPathTimeoutMs,
    params: {
      cmisselector: "parents",
      objectId,
      includeRelativePathSegment: true,
    },
  });
  const parents = Array.isArray(result.data)
    ? result.data
    : result.data.objects || result.data.parents || [];

  return parents.map((item) => mapCmisObject(item));
}
//ฟังชันแปลง CMIS objectId เป็น Alfresco nodeId สำหรับเรียก REST API
function getNodeIdFromObjectId(objectId) {
  const value = String(objectId || "").trim();
  if (!value) return null;

  const withoutVersion = value.split(";")[0];
  const match = withoutVersion.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  return match ? match[0] : withoutVersion;
}
//ฟังชันดึง parent path ของเอกสารจาก Alfresco REST API ตาม objectId
async function getNodePathByObjectId(objectId, headers) {
  const nodeId = getNodeIdFromObjectId(objectId);
  if (!nodeId) return null;

  const result = await alfrescoHttp.get(
    `${config.alfrescoHost}/alfresco/api/-default-/public/alfresco/versions/1/nodes/${encodeURIComponent(nodeId)}`,
    {
      headers,
      timeout: parentPathTimeoutMs,
      params: { include: "path" },
    }
  );
  const entry = result.data?.entry || result.data;

  return entry?.path?.name || null;
}
//ฟังชันสตรีมเนื้อหาเอกสารจาก Alfresco ตาม id
async function getDocumentContentStream(id, headers) {
  return alfrescoHttp.get(`${config.alfrescoCmis}/root`, {
    headers,
    params: { cmisselector: "content", objectId: id },
    responseType: "stream",
  });
}
//ฟังชันตรวจสอบความปลอดภัยของชื่อไฟล์
function safeFileName(name) {
  return path.basename(name || "download");
}

module.exports = {
  createDocument,
  deleteDocument,
  getChildrenByPath,
  getDocumentContentStream,
  getNodePathByObjectId,
  getObjectParents,
  getObjectById,
  getObjectByPath,
  getServerInfo,
  queryDocuments,
  safeFileName,
  setDocumentContentStream,
  updateDocumentProperties,
};
