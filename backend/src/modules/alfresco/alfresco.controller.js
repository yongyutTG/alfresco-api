const alfrescoRepo = require("./alfresco.repo");
const alfrescoService = require("./alfresco.service");
const { handleError } = require("../../middlewares/errorHandler");

// Controller = รับ req/res จาก route แล้วเรียก service/repo ที่เกี่ยวข้อง
async function health(req, res) {
  try {
    const serverInfo = await alfrescoRepo.getServerInfo();
    res.json({ ok: true, alfresco: serverInfo });
  } catch (err) {
    handleError(res, "Cannot connect to Alfresco", err);
  }
}

async function folders(req, res) {
  try {
    const folderPath = req.query.path || "/";
    const foldersOnly = await alfrescoService.listFolders(folderPath);
    res.json(foldersOnly);
  } catch (err) {
    handleError(res, "Cannot list Alfresco folders", err);
  }
}

async function foldersFiles(req, res) {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const result = await alfrescoService.listDocumentsInTree(folderPath, req.query);
    res.json(alfrescoService.withNextSkipCount(result));
  } catch (err) {
    handleError(res, "Cannot list Alfresco folder files", err);
  }
}

async function documents(req, res) {
  try {
    const folderPath = req.query.folderPath || req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const exactName = req.query.exactName || req.query.fileName;
    const result = await alfrescoService.findDocuments(folderPath, {
      ...req.query,
      exactName,
    });

    res.json(alfrescoService.withNextSkipCount(result));
  } catch (err) {
    handleError(res, "Cannot list Alfresco documents", err);
  }
}

async function documentContent(req, res) {
  try {
    await alfrescoService.streamDocumentContent(res, req.params.id, req.query.name);
  } catch (err) {
    handleError(res, "Cannot download Alfresco document", err);
  }
}

async function root(req, res) {
  try {
    const items = await alfrescoService.listChildren("/");
    res.json(items);
  } catch (err) {
    handleError(res, "Cannot read Alfresco root", err);
  }
}

async function sites(req, res) {
  try {
    const items = await alfrescoService.listChildren("/Sites");
    res.json(items);
  } catch (err) {
    handleError(res, "Cannot read Alfresco sites", err);
  }
}

async function children(req, res) {
  try {
    const folderPath = req.query.path || "/";
    const items = await alfrescoService.listChildren(folderPath);
    res.json(items);
  } catch (err) {
    handleError(res, "Cannot read Alfresco folder", err);
  }
}

async function files(req, res) {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const result = await alfrescoService.listDocumentsInTree(folderPath, req.query);
    res.json(result);
  } catch (err) {
    handleError(res, "Cannot list Alfresco files", err);
  }
}

async function fileNames(req, res) {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const result = await alfrescoService.listDocumentsInTree(folderPath, req.query);

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
}

async function searchFiles(req, res) {
  try {
    const folderPath = req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const q = req.query.q || req.query.keyword || req.query.name;
    const exactName = req.query.exactName || req.query.fileName;

    if ((!q || !String(q).trim()) && (!exactName || !String(exactName).trim())) {
      return res.status(400).json({
        message: "Missing search keyword",
        example: "/api/alfresco/search-files?path=/Sites/tg-saving/documentLibrary/การเงิน&q=ATM หรือ exactName=23017_116969.pdf",
      });
    }

    const result = await alfrescoService.findDocuments(folderPath, {
      ...req.query,
      q,
      exactName,
    });
    res.json(alfrescoService.withNextSkipCount(result));
  } catch (err) {
    handleError(res, "Cannot search Alfresco files", err);
  }
}

async function object(req, res) {
  try {
    const { id, path: objectPath } = req.query;

    if (!id && !objectPath) {
      return res.status(400).json({ message: "Missing id or path" });
    }

    const cmisObject = await alfrescoService.readObject(id, objectPath);
    res.json(cmisObject);
  } catch (err) {
    handleError(res, "Cannot read Alfresco object", err);
  }
}

async function content(req, res) {
  try {
    await alfrescoService.streamDocumentContent(res, req.query.id, req.query.name);
  } catch (err) {
    handleError(res, "Cannot download Alfresco file", err);
  }
}

async function devDocuments(req, res) {
  try {
    const folderPath = req.query.folderPath || req.query.path || "/Sites/tg-saving/documentLibrary/การเงิน";
    const exactName = req.query.exactName || req.query.fileName;
    const result = await alfrescoService.findDocuments(folderPath, {
      ...req.query,
      exactName,
    });

    res.json({
      ...alfrescoService.withNextSkipCount(result),
      files: result.files.map((file) => ({
        ...file,
        downloadUrl: file.downloadUrl
          ? file.downloadUrl.replace("/api/alfresco/", "/dev-api/alfresco/")
          : null,
      })),
    });
  } catch (err) {
    handleError(res, "Cannot list Alfresco documents", err);
  }
}

module.exports = {
  health,
  folders,
  foldersFiles,
  documents,
  documentContent,
  root,
  sites,
  children,
  files,
  fileNames,
  searchFiles,
  object,
  content,
  devDocuments,
};
