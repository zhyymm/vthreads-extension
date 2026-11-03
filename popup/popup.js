// VThreads Extension - Popup Logic (Manifest V3)

const API_BASE = "https://vthreads.top";

// 状态管理
let isProUser = false;
let currentExtraction = null;
let currentVid = "";

document.addEventListener("DOMContentLoaded", async () => {
  initI18n();
  bindEvents();
  await checkProStatus();
  autoDetectCurrentTab();
});

// 1. 初始化多语言
function initI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) {
      el.textContent = msg;
    }
  });
  const placeholderKey = "placeholder";
  const placeholderMsg = chrome.i18n.getMessage(placeholderKey);
  if (placeholderMsg) {
    document.getElementById("urlInput").setAttribute("placeholder", placeholderMsg);
  }
}

// 2. 绑定交互事件
function bindEvents() {
  const urlInput = document.getElementById("urlInput");
  const btnClear = document.getElementById("btnClear");
  const btnExtract = document.getElementById("btnExtract");
  const btnDetectTab = document.getElementById("btnDetectTab");
  const btnSyncPro = document.getElementById("btnSyncPro");
  const btnCloseModal = document.getElementById("btnCloseModal");

  urlInput.addEventListener("input", () => {
    btnClear.style.display = urlInput.value.trim() ? "block" : "none";
  });

  btnClear.addEventListener("click", () => {
    urlInput.value = "";
    btnClear.style.display = "none";
    urlInput.focus();
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleExtract();
    }
  });

  btnExtract.addEventListener("click", () => handleExtract());
  btnDetectTab.addEventListener("click", () => autoDetectCurrentTab(true));
  btnSyncPro.addEventListener("click", () => syncProStatus());
  btnCloseModal.addEventListener("click", () => {
    document.getElementById("proModal").style.display = "none";
  });
}

// 3. 自动检测当前活动标签页
async function autoDetectCurrentTab(forceExtract = false) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    const currentUrl = tab.url;
    // 过滤内部页面 (chrome://, edge://, about:)
    if (/^(chrome|edge|about|devtools):/i.test(currentUrl)) return;

    const urlInput = document.getElementById("urlInput");

    // 检测是否为支持的视频网页
    let cleanUrl = currentUrl;
    if (/threads\.(net|com)/i.test(cleanUrl)) {
      cleanUrl = cleanUrl.replace(/\/media\/?(\?.*)?$/, "");
    }
    if (isSupportedUrl(cleanUrl)) {
      urlInput.value = cleanUrl;
      document.getElementById("btnClear").style.display = "block";
      handleExtract(cleanUrl);
    } else if (forceExtract) {
      urlInput.value = cleanUrl;
      document.getElementById("btnClear").style.display = "block";
      handleExtract(cleanUrl);
    }
  } catch (e) {
    console.warn("[VThreads] Failed to query active tab:", e);
  }
}

function isSupportedUrl(url) {
  return /twitter\.com|x\.com|tiktok\.com|threads\.(net|com)|instagram\.com|bilibili\.com|douyin\.com|kuaishou\.com|reddit\.com/i.test(
    url
  );
}

// 3.1 确保领取门票与访客 ID (HMAC vid)
async function ensureSessionAndVid(forceNew = false) {
  try {
    await fetch(`${API_BASE}/api/session_gate?client=extension`, {
      cache: "no-store",
      credentials: "include"
    });
  } catch (e) {
    console.warn("[VThreads] session_gate warning:", e);
  }

  if (!forceNew) {
    const stored = await chrome.storage.local.get("vt_visitor_id");
    if (stored && stored.vt_visitor_id && stored.vt_visitor_id.startsWith("vt1")) {
      return stored.vt_visitor_id;
    }
  }
  try {
    const res = await fetch(`${API_BASE}/api/visitor_id?client=extension`, {
      cache: "no-store",
      credentials: "include"
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.vid) {
        await chrome.storage.local.set({ vt_visitor_id: data.vid });
        return data.vid;
      }
    }
  } catch (e) {
    console.warn("[VThreads] Failed to mint visitor_id:", e);
  }
  return "";
}

// 4. 同步/检查用户 Pro 权益
async function checkProStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me?client=extension`, {
      cache: "no-store",
      credentials: "include"
    });
    if (res.ok) {
      const data = await res.json();
      isProUser = data?.is_pro === true || data?.user?.is_pro === true;
    }
  } catch {
    isProUser = false;
  }
  updateProBadge(isProUser);
}

async function syncProStatus() {
  const btn = document.getElementById("btnSyncPro");
  btn.style.transform = "rotate(180deg)";
  await checkProStatus();
  setTimeout(() => {
    btn.style.transform = "rotate(0deg)";
  }, 400);
}

function updateProBadge(isPro) {
  const badge = document.getElementById("userTierBadge");
  if (isPro) {
    badge.textContent = "PRO";
    badge.classList.add("active");
  } else {
    badge.textContent = "FREE";
    badge.classList.remove("active");
  }
}

// 5. 核心解析逻辑
async function handleExtract(overrideUrl) {
  const inputEl = document.getElementById("urlInput");
  const targetUrl = (overrideUrl || inputEl.value || "").trim();

  if (!targetUrl) {
    showError(chrome.i18n.getMessage("noUrl") || "请输入视频网页链接");
    return;
  }

  // Google Chrome Web Store 政策合规：严格禁止下载 YouTube，且不得引导至第三方网站
  if (/youtube\.com|youtu\.be/i.test(targetUrl)) {
    const isZh = chrome.i18n.getUILanguage().startsWith("zh");
    showError(
      isZh
        ? "受 Chrome 应用商店政策及服务条款限制，本扩展不支持下载 YouTube 视频。"
        : "Due to Chrome Web Store policy and terms of service, downloading videos from YouTube is not supported."
    );
    return;
  }

  showLoading(true);
  hideResult();
  hideError();

  // 优先尝试与当前页面的 Content Script 通信进行就地嗅探（0 依赖服务端 Cookie，0 服务端封禁）
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id && activeTab.url) {
      const activeUrl = activeTab.url.split("?")[0].replace(/\/$/, "");
      const reqUrl = targetUrl.split("?")[0].replace(/\/$/, "");
      if (activeUrl === reqUrl || activeUrl.includes(reqUrl) || reqUrl.includes(activeUrl)) {
        const sniffResult = await new Promise((resolve) => {
          chrome.tabs.sendMessage(activeTab.id, { action: "SNIFF_LOCAL_MEDIA", url: targetUrl }, (resp) => {
            if (chrome.runtime.lastError || !resp || !resp.success) {
              resolve(null);
            } else {
              resolve(resp.info);
            }
          });
        });
        if (sniffResult && sniffResult.medias && sniffResult.medias.length > 0) {
          console.log("[VThreads Popup] 本地嗅探解析成功，无需经过服务端 Cookie:", sniffResult);
          currentExtraction = sniffResult;
          renderResult(sniffResult);
          showLoading(false);
          return;
        }
      }
    }
  } catch (e) {
    console.log("[VThreads Popup] 本地嗅探跳过:", e);
  }

  try {
    let vid = await ensureSessionAndVid();
    currentVid = vid;
    const lang = chrome.i18n.getUILanguage().startsWith("zh") ? "zh" : "en";
    let apiUrl = `${API_BASE}/api/extract?url=${encodeURIComponent(targetUrl)}&lang=${lang}&client=extension`;
    if (vid) {
      apiUrl += `&vid=${encodeURIComponent(vid)}`;
    }

    let res = await fetch(apiUrl, { credentials: "include" });
    let data = null;
    let rawText = "";
    try {
      rawText = await res.text();
      data = JSON.parse(rawText);
    } catch { /* ignore */ }

    // 如果提示 GATE_REQUIRED 或 INVALID_VID 或返回非 JSON 挑战，强制重新获取门票和 vid 重试一次
    if (res.status === 403 && (data?.err_code === "GATE_REQUIRED" || data?.err_code === "INVALID_VID" || !data)) {
      vid = await ensureSessionAndVid(true);
      if (vid) {
        apiUrl = `${API_BASE}/api/extract?url=${encodeURIComponent(targetUrl)}&lang=${lang}&client=extension&vid=${encodeURIComponent(vid)}`;
        res = await fetch(apiUrl, { credentials: "include" });
        try {
          rawText = await res.text();
          data = JSON.parse(rawText);
        } catch { /* ignore */ }
      }
    }

    if (!res.ok || data?.status === "error" || data?.error) {
      console.warn("[VThreads] Extract response error:", res.status, rawText);
      const errMsg = data?.error || data?.message || "未能成功解析该视频，请检查链接或稍后重试。";
      showError(errMsg);
      return;
    }

    const info = data.data || data;
    currentExtraction = info;
    renderResult(info);
  } catch (err) {
    console.error("[VThreads] Extract failed:", err);
    showError("网络请求异常，请确认网络连接或前往官网重试。");
  } finally {
    showLoading(false);
  }
}

// 6. 渲染解析结果
function renderResult(info) {
  const resultSection = document.getElementById("resultSection");
  const thumbEl = document.getElementById("videoThumb");
  const titleEl = document.getElementById("videoTitle");
  const platformEl = document.getElementById("platformBadge");
  const durationEl = document.getElementById("durationBadge");
  const listEl = document.getElementById("formatsList");

  let thumbUrl = info.thumbnail || "../icons/icon128.png";
  if (thumbUrl.startsWith("/")) {
    thumbUrl = `${API_BASE}${thumbUrl}`;
  }
  thumbEl.src = thumbUrl;
  titleEl.textContent = info.title || "社交媒体原画视频";
  platformEl.textContent = (info.platform || "Video").toUpperCase();

  if (info.duration) {
    durationEl.textContent = formatDuration(info.duration);
    durationEl.style.display = "block";
  } else {
    durationEl.style.display = "none";
  }

  listEl.innerHTML = "";

  const medias = info.medias || [];
  if (medias.length === 0) {
    showError("未在此页面中检测到可下载的高清流媒体源。");
    return;
  }

  medias.forEach((m) => {
    const card = document.createElement("div");
    card.className = "format-card";

    // 判断是否为合并任务（B站 DASH、无声分轨合并等）
    const isMergeFormat = m.format === "merge" || (m.url && (m.url.includes("/api/download_merge") || m.url.includes("/api/download_jable")));
    let downloadUrl = "";
    let proxyUrl = "";

    if (isMergeFormat) {
      // 合并任务严格保留 /api/download_merge，交由后台轮询合成，绝不可直连分轨 m4s
      downloadUrl = m.url || "";
      if (downloadUrl.startsWith("/")) downloadUrl = `${API_BASE}${downloadUrl}`;
    } else {
      // 单流视频：优先直连平台 CDN（走用户带宽），同时保留代理地址作为异常兜底
      if (m.url && m.url.includes("/api/proxy")) {
        proxyUrl = m.url.startsWith("/") ? `${API_BASE}${m.url}` : m.url;
        try {
          const uObj = new URL(proxyUrl);
          const rawCdn = uObj.searchParams.get("url");
          if (rawCdn && /^https?:\/\//i.test(rawCdn)) {
            downloadUrl = rawCdn;
          } else {
            downloadUrl = proxyUrl;
          }
        } catch {
          downloadUrl = proxyUrl;
        }
      } else if (m.raw_url && /^https?:\/\//i.test(m.raw_url)) {
        downloadUrl = m.raw_url;
        proxyUrl = m.url && m.url.startsWith("/") ? `${API_BASE}${m.url}` : (m.url || "");
      } else {
        downloadUrl = m.url || "";
        if (downloadUrl.startsWith("/")) downloadUrl = `${API_BASE}${downloadUrl}`;
      }
    }

    const isAudio = m.format === "mp3" || /audio/i.test(m.quality);
    const qualityNum = parseInt(m.quality, 10) || 0;
    const isProLocked = !isProUser && (qualityNum >= 1080 || /4k|60fps/i.test(m.quality));

    card.innerHTML = `
      <div class="format-info">
        <div class="format-quality-row">
          <span class="format-quality">${escapeHtml(m.quality || "HD")}</span>
          <span class="badge-tag ${isProLocked ? "badge-pro" : "badge-free"}">
            ${isProLocked ? "PRO" : "FREE"}
          </span>
        </div>
        <span class="format-size">${escapeHtml(m.size || "")} ${m.format ? "· " + m.format.toUpperCase() : ""}</span>
      </div>
      <div class="format-actions">
        <button class="copy-btn" title="复制直链" data-url="${escapeHtml(downloadUrl)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="dl-btn ${isProLocked ? "btn-locked" : ""}" data-url="${escapeHtml(downloadUrl)}" data-proxy="${escapeHtml(proxyUrl)}" data-merge="${isMergeFormat}" data-pro="${isProLocked}">
          ${isProLocked ? "⚡ 解锁 4K" : "下载"}
        </button>
      </div>
    `;

    // 绑定复制按钮
    card.querySelector(".copy-btn").addEventListener("click", (e) => {
      const u = e.currentTarget.getAttribute("data-url");
      navigator.clipboard.writeText(u);
      alert(chrome.i18n.getMessage("copied") || "已复制到剪贴板！");
    });

    // 绑定下载按钮
    card.querySelector(".dl-btn").addEventListener("click", (e) => {
      const isLocked = e.currentTarget.getAttribute("data-pro") === "true";
      const u = e.currentTarget.getAttribute("data-url");
      const pUrl = e.currentTarget.getAttribute("data-proxy") || "";
      const isMerge = e.currentTarget.getAttribute("data-merge") === "true" || u.includes("/api/download_merge") || u.includes("/api/download_jable");
      if (isLocked) {
        document.getElementById("proModal").style.display = "flex";
      } else {
        const btn = e.currentTarget;
        const originalText = btn.textContent;
        if (isMerge) {
          btn.textContent = "合并中...";
          btn.disabled = true;
        }
        const cleanTitle = (currentExtraction?.title || "video")
          .replace(/[/\\?%*:|"<>]/g, "_")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
        const filename = `${cleanTitle}_${m.quality || "hd"}.${m.format && m.format !== "merge" ? m.format : "mp4"}`;

        chrome.runtime.sendMessage(
          {
            action: "TRIGGER_DOWNLOAD",
            url: u,
            proxyUrl: pUrl,
            isMerge: isMerge,
            vid: currentVid,
            filename: filename
          },
          (resp) => {
            btn.textContent = originalText;
            btn.disabled = false;
            if (resp && !resp.success) {
              alert("下载失败: " + (resp.error || "未知错误"));
            }
          }
        );
      }
    });

    listEl.appendChild(card);
  });


  resultSection.style.display = "flex";
}

function showLoading(show) {
  document.getElementById("loadingState").style.display = show ? "flex" : "none";
}

function hideResult() {
  document.getElementById("resultSection").style.display = "none";
}

function showError(msg) {
  const errBox = document.getElementById("errorState");
  const errMsg = document.getElementById("errorMsg");
  errMsg.textContent = msg;
  errBox.style.display = "flex";
}

function hideError() {
  document.getElementById("errorState").style.display = "none";
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
