const axios = require("axios");
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
  sendContentStream,
};
