// This demo UI intentionally calls /dev-api/alfresco/*.
// /dev-api/alfresco/* is a localhost-only proxy so the browser does not need to hold the Bearer token.
//
// External dev API reference:
// - GET /api/alfresco/folders?path=/Sites/tg-saving/documentLibrary
// - GET /api/alfresco/folders/files?path=/Sites/tg-saving/documentLibrary/การเงิน&maxItems=100&skipCount=0
// - GET /api/alfresco/documents?folderPath=/Sites/tg-saving/documentLibrary/การเงิน&q=026277&maxItems=100
// - GET /api/alfresco/documents/:id/content?name=file.pdf
// External devs must send: Authorization: Bearer <API_TOKEN>
const documentLibraryPath = "/Sites/tg-saving/documentLibrary";

const state = {
  folderPath: "",
  q: "",
  maxItems: 100,
  skipCount: 0,
  hasMoreItems: false,
  total: 0,
  loading: false,
};

const els = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  folderSelect: document.getElementById("folderSelect"),
  keyword: document.getElementById("keyword"),
  pageSize: document.getElementById("pageSize"),
  loadBtn: document.getElementById("loadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  currentPath: document.getElementById("currentPath"),
  apiStatus: document.getElementById("apiStatus"),
  summaryText: document.getElementById("summaryText"),
  pageText: document.getElementById("pageText"),
  fileRows: document.getElementById("fileRows"),
  requestPreview: document.getElementById("requestPreview"),
};

function normalizeBaseUrl() {
  return els.apiBaseUrl.value.trim().replace(/\/+$/, "");
}

function authHeaders() {
  return {};
}

function buildUrl(path, params) {
  const query = new URLSearchParams(params);
  return `${normalizeBaseUrl()}${path}?${query.toString()}`;
}

function updateRequestPreview(url) {
  els.requestPreview.textContent = [
    `GET ${url}`,
    "Auth: local-only /dev-api proxy",
  ].join("\n");
}

async function fetchJson(url) {
  updateRequestPreview(url);
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }

  return data;
}

function setLoading(loading) {
  state.loading = loading;
  for (const element of [els.apiBaseUrl, els.folderSelect, els.keyword, els.pageSize, els.loadBtn, els.clearBtn]) {
    element.disabled = loading;
  }
  els.prevBtn.disabled = loading || state.skipCount === 0;
  els.nextBtn.disabled = loading || !state.hasMoreItems;
  els.apiStatus.textContent = loading ? "กำลังโหลด" : "พร้อมใช้งาน";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ms) {
  if (!ms) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(Number(ms)));
}

async function loadFolderOptions() {
  setLoading(true);
  els.summaryText.textContent = "กำลังโหลดรายชื่อโฟลเดอร์...";

  try {
    const url = buildUrl("/dev-api/alfresco/folders", { path: documentLibraryPath });
    const folders = await fetchJson(url);
    const folderItems = folders
      .filter((item) => item.isFolder && item.path)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));

    const options = folderItems
      .map((folder) => `<option value="${escapeHtml(folder.path)}">${escapeHtml(folder.name)}</option>`)
      .join("");

    els.folderSelect.innerHTML = `<option value="">-- เลือกโฟลเดอร์ --</option>${options}`;
    els.folderSelect.value = folderItems.some((folder) => folder.path === state.folderPath) ? state.folderPath : "";
    state.folderPath = els.folderSelect.value;
    els.currentPath.textContent = state.folderPath || "ยังไม่ได้เลือกโฟลเดอร์";
    els.summaryText.textContent = "เลือกโฟลเดอร์ที่ต้องการ แล้วกดโหลดหรือค้นหา";
  } catch (err) {
    els.summaryText.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
    els.fileRows.innerHTML = '<tr><td colspan="5" class="empty error">โหลดรายชื่อโฟลเดอร์ไม่สำเร็จ</td></tr>';
  } finally {
    setLoading(false);
  }
}

function buildDocumentsUrl() {
  const params = {
    folderPath: state.folderPath,
    maxItems: String(state.maxItems),
    skipCount: String(state.skipCount),
  };

  if (state.q) {
    params.q = state.q;
  }

  return buildUrl("/dev-api/alfresco/documents", params);
}

function renderRows(files) {
  if (!files.length) {
    els.fileRows.innerHTML = '<tr><td colspan="5" class="empty">ไม่พบไฟล์</td></tr>';
    return;
  }

  els.fileRows.innerHTML = files.map((file, index) => {
    const rowNumber = state.skipCount + index + 1;
    return `
      <tr>
        <td class="num">${rowNumber}</td>
        <td class="name">${escapeHtml(file.name || "-")}</td>
        <td class="num muted">${formatBytes(file.size)}</td>
        <td class="muted">${formatDate(file.creationDate)}</td>
        <td><button type="button" class="secondary" data-url="${escapeHtml(file.downloadUrl || "")}">เปิด</button></td>
      </tr>
    `;
  }).join("");
}

async function loadFiles() {
  if (!state.folderPath) {
    els.fileRows.innerHTML = '<tr><td colspan="5" class="empty">กรุณาเลือกโฟลเดอร์ก่อน</td></tr>';
    els.summaryText.textContent = "ยังไม่ได้เลือกโฟลเดอร์";
    els.pageText.textContent = "";
    state.hasMoreItems = false;
    setLoading(false);
    return;
  }

  setLoading(true);
  els.summaryText.textContent = "กำลังโหลดข้อมูล...";
  els.pageText.textContent = "";
  els.currentPath.textContent = state.folderPath;

  try {
    const data = await fetchJson(buildDocumentsUrl());
    state.total = data.total || 0;
    state.hasMoreItems = Boolean(data.hasMoreItems);
    renderRows(data.files || []);

    const mode = state.q ? `ผลค้นหา "${state.q}"` : "ไฟล์ทั้งหมด";
    els.summaryText.innerHTML = `<strong>${mode}</strong> แสดง ${data.count || 0} จากทั้งหมด ${state.total.toLocaleString("th-TH")} รายการ`;
    els.pageText.textContent = `skipCount ${state.skipCount.toLocaleString("th-TH")} | maxItems ${state.maxItems}`;
  } catch (err) {
    els.fileRows.innerHTML = '<tr><td colspan="5" class="empty error">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    els.summaryText.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
    state.hasMoreItems = false;
  } finally {
    setLoading(false);
  }
}

function syncSearchState(resetPage = true) {
  state.folderPath = els.folderSelect.value || "";
  state.q = els.keyword.value.trim();
  state.maxItems = Number(els.pageSize.value);
  if (resetPage) state.skipCount = 0;
  els.currentPath.textContent = state.folderPath || "ยังไม่ได้เลือกโฟลเดอร์";
  sessionStorage.setItem("devAlfrescoApiBaseUrl", els.apiBaseUrl.value.trim());
}

function refreshFiles(resetPage = true) {
  syncSearchState(resetPage);
  loadFiles();
}

async function openDocument(url) {
  if (!url) return;

  const fullUrl = `${normalizeBaseUrl()}${url}`;
  updateRequestPreview(fullUrl);
  const res = await fetch(fullUrl, { headers: authHeaders() });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const error = await res.json();
      message = error.message || message;
    } catch (err) {}
    alert(message);
    return;
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

els.loadBtn.addEventListener("click", () => refreshFiles(true));
els.clearBtn.addEventListener("click", () => {
  els.keyword.value = "";
  refreshFiles(true);
});
els.keyword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") refreshFiles(true);
});
els.folderSelect.addEventListener("change", () => {
  els.keyword.value = "";
  refreshFiles(true);
});
els.pageSize.addEventListener("change", () => refreshFiles(true));
els.prevBtn.addEventListener("click", () => {
  state.skipCount = Math.max(0, state.skipCount - state.maxItems);
  refreshFiles(false);
});
els.nextBtn.addEventListener("click", () => {
  state.skipCount += state.maxItems;
  refreshFiles(false);
});
els.fileRows.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-url]");
  if (button) openDocument(button.dataset.url);
});

els.apiBaseUrl.value = window.location.origin || "http://localhost:3000";
setLoading(false);
loadFolderOptions();

