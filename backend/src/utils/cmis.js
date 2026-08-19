const path = require("path");
const { env } = require("../config/env");

// แปลง path Alfresco เช่น /Sites/tg-saving/documentLibrary/การเงิน
// ให้เป็น URL ของ CMIS Browser Binding ที่ Alfresco 4.2.0 ใช้ได้
function cmisUrlForPath(folderPath = "/") {
  const normalizedPath = String(folderPath || "/").trim();

  if (normalizedPath === "/") {
    return `${env.alfrescoCmisUrl}/root`;
  }

  const encodedSegments = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${env.alfrescoCmisUrl}/root/${encodedSegments}`;
}

// อ่านค่า property จาก CMIS response เพราะ Alfresco ห่อค่าไว้ใน properties[key].value
function getProp(properties, key) {
  const value = properties?.[key]?.value ?? null;

  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : value;
  }

  return value;
}

// Step 5: แปลง object ดิบจาก Alfresco CMIS ให้ frontend/dev อ่านง่าย
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

function escapeCmisString(value) {
  return String(value).replace(/'/g, "''");
}

function escapeCmisLike(value) {
  return escapeCmisString(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function safeFileName(name) {
  return path.basename(name || "download");
}

module.exports = {
  cmisUrlForPath,
  mapCmisObject,
  escapeCmisString,
  escapeCmisLike,
  safeFileName,
};
