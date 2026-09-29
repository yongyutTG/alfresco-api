const { env: config } = require("../config/env");

function cmisUrlForPath(folderPath = "/") {
  const normalizedPath = String(folderPath || "/").trim();
  if (normalizedPath === "/") return `${config.alfrescoCmis}/root`;

  const encodedSegments = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${config.alfrescoCmis}/root/${encodedSegments}`;
}

function getProp(properties, key) {
  const value = properties?.[key]?.value ?? null;
  if (Array.isArray(value)) return value.length === 1 ? value[0] : value;
  return value;
}

function hasAllowableAction(item, actionName) {
  const object = item.object || item;
  const allowableActions = object.allowableActions || item.allowableActions;
  const actions = allowableActions?.allowableActions || allowableActions;

  if (Array.isArray(actions)) {
    return actions.includes(actionName);
  }

  if (actions && typeof actions === "object") {
    return Boolean(actions[actionName]);
  }

  return false;
}

function mapCmisObject(item, contentRoutePrefix = "/api/alfresco") {
  const object = item.object || item;
  const props = object.properties || {};
  const type = getProp(props, "cmis:baseTypeId");
  const name = getProp(props, "cmis:name");
  const id = getProp(props, "cmis:objectId");
  const allowRename = type === "cmis:document" && hasAllowableAction(item, "canUpdateProperties");
  const permissions = {
    canView: type === "cmis:document",
    canRename: allowRename,
    canEditProperties: type === "cmis:document" && hasAllowableAction(item, "canUpdateProperties"),
    canDelete: type === "cmis:document" && hasAllowableAction(item, "canDeleteObject"),
    canUpdateContent: type === "cmis:document" && (
      hasAllowableAction(item, "canSetContentStream") ||
      hasAllowableAction(item, "canDeleteContentStream")
    ),
  };

  return {
    id,
    name,
    path: getProp(props, "cmis:path"),
    type,
    objectTypeId: getProp(props, "cmis:objectTypeId"),
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
    allowRename,
    permissions,
    downloadUrl: type === "cmis:document"
      ? `${contentRoutePrefix}/documents/${encodeURIComponent(id)}/content?name=${encodeURIComponent(name || "download")}`
      : null,
  };
}

function escapeCmisString(value) {
  return String(value).replace(/'/g, "''");
}

function escapeCmisLike(value) {
  return escapeCmisString(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

module.exports = {
  cmisUrlForPath,
  escapeCmisLike,
  escapeCmisString,
  hasAllowableAction,
  mapCmisObject,
};

module.exports.safeFileName = (name) => require("path").basename(name || "download");
