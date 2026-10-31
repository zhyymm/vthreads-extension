// VThreads Extension - Background Service Worker (Manifest V3)

const API_BASE = "https://vthreads.top";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[VThreads Extension] Installed / Updated successfully.");
  if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.getDynamicRules) {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      const ids = rules.map((r) => r.id);
      if (ids.length > 0) {
        chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
      }
    });
  }
});

// 1. 获取或签发 HMAC 访客指纹
async function ensureVisitorId(forceNew = false) {
  try {
    await fetch(`${API_BASE}/api/session_gate?client=extension`, {
      cache: "no-store",
      credentials: "include"
    });
  } catch (e) {
    console.warn("[VThreads Background] session_gate warning:", e);
  }

  if (!forceNew) {
    const stored = await chrome.storage.local.get("vt_visitor_id");
    if (stored?.vt_visitor_id && stored.vt_visitor_id.startsWith("vt1")) {
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
      if (data?.vid) {
        await chrome.storage.local.set({ vt_visitor_id: data.vid });
        return data.vid;
      }
    }
  } catch (e) {
    console.warn("[VThreads Background] Failed to mint visitor_id:", e);
  }
  return "";
}

// 2. 检查用户 Pro 状态
async function checkProStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me?client=extension`, {
      cache: "no-store",
      credentials: "include"
    });
    if (res.ok) {
      const data = await res.json();
      return data?.is_pro === true || data?.user?.is_pro === true;
    }
  } catch {
    return false;
  }
  return false;
}

// 3. 执行视频解析
async function extractVideo(targetUrl) {
  let vid = await ensureVisitorId();
  let apiUrl = `${API_BASE}/api/extract?url=${encodeURIComponent(targetUrl)}&lang=zh&client=extension`;
  if (vid) {
    apiUrl += `&vid=${encodeURIComponent(vid)}`;
  }

  let res = await fetch(apiUrl, { credentials: "include" });
  let data = null;
  let rawText = "";
  try {
    rawText = await res.text();
    data = JSON.parse(rawText);
  } catch {}

  // 若遇到门票拦截或指纹过期，强制换新重试一次
  if (res.status === 403 && (data?.err_code === "GATE_REQUIRED" || data?.err_code === "INVALID_VID" || !data)) {
    vid = await ensureVisitorId(true);
    if (vid) {
      apiUrl = `${API_BASE}/api/extract?url=${encodeURIComponent(targetUrl)}&lang=zh&client=extension&vid=${encodeURIComponent(vid)}`;
      res = await fetch(apiUrl, { credentials: "include" });
      try {
        rawText = await res.text();
        data = JSON.parse(rawText);
      } catch {}
    }
  }

  if (!res.ok || data?.status === "error" || data?.error) {
    const errMsg = data?.error || data?.message || "未能成功解析该视频，请检查链接或稍后重试。";
    throw new Error(errMsg);
  }

  const info = data.data || data;
  const isPro = await checkProStatus();
  return { info, isPro, vid };
}

// 4. 执行下载触发（支持直链、代理流以及服务端合并任务）
async function executeDownload(request) {
  let downloadUrl = request.url || "";
  let proxyUrl = request.proxyUrl || "";
  let vid = request.vid || (await ensureVisitorId());
  let filename = (request.filename || "vthreads_video.mp4")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/[\x00-\x1f\x80-\x9f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
  if (!filename) filename = "vthreads_video.mp4";

  if (downloadUrl.startsWith("/")) {
    downloadUrl = `${API_BASE}${downloadUrl}`;
  }
  if (proxyUrl && proxyUrl.startsWith("/")) {
    proxyUrl = `${API_BASE}${proxyUrl}`;
  }

  const isMerge =
    request.isMerge ||
    downloadUrl.includes("/api/download_merge") ||
    downloadUrl.includes("/api/download_jable");

  // A. 服务端合并任务 (/api/download_merge 或 /api/download_jable)
  if (isMerge) {
    const sep = downloadUrl.includes("?") ? "&" : "?";
    if (!downloadUrl.includes("vid=") && vid) {
      downloadUrl += `${sep}vid=${encodeURIComponent(vid)}&client=extension`;
    } else if (!downloadUrl.includes("client=")) {
      downloadUrl += `${sep}client=extension`;
    }

    // 1. 发起合并任务
    const res = await fetch(downloadUrl, { credentials: "include" });
    let taskData = null;
    try {
      taskData = await res.json();
    } catch {
      throw new Error("服务端未能创建合并任务");
    }

    if (!res.ok) {
      throw new Error(taskData?.error || taskData?.message || "视频合并任务创建失败");
    }

    const taskId = taskData?.task_id;
    if (!taskId) throw new Error("未获取到下载任务编号");

    // 2. 命中缓存直接取货
    if (taskData.status === "SUCCESS" && taskData.download_url) {
      let finalUrl = taskData.download_url;
      if (finalUrl.startsWith("/")) finalUrl = `${API_BASE}${finalUrl}`;
      return await startChromeDownload(finalUrl, filename);
    }

    // 3. 异步轮询合并进度（最多等待 90 秒）
    let attempts = 0;
    while (attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      attempts++;

      try {
        const checkRes = await fetch(`${API_BASE}/api/check_status/${taskId}`, { credentials: "include" });
        if (!checkRes.ok) continue;
        const statusData = await checkRes.json();

        if (statusData.status === "SUCCESS") {
          let finalUrl = statusData.download_url;
          if (!finalUrl) throw new Error("下载链接为空");
          if (finalUrl.startsWith("/")) finalUrl = `${API_BASE}${finalUrl}`;
          return await startChromeDownload(finalUrl, filename);
        }

        if (statusData.status === "FAILED") {
          throw new Error(statusData.error || "服务端视频合并失败，请稍后重试");
        }
      } catch (err) {
        if (attempts >= 60) throw err;
      }
    }
    throw new Error("视频合并超时，请稍后重试");
  }

  // B. 单流视频：优先直连平台官方 CDN（走用户本地家庭宽带，0 服务器流量）
  let targetUrl = downloadUrl;

  // 深度安全防护：如果直连平台 CDN 响应非视频（例如返回 403 / text/html 错误拦截页），自动回退到 /api/proxy 代理通道
  let needsProxyFallback = false;
  if (!targetUrl.includes("/api/proxy")) {
    try {
      const probeRes = await fetch(targetUrl, { method: "HEAD" });
      const ct = probeRes.headers.get("content-type") || "";
      if (!probeRes.ok || ct.includes("text/html")) {
        console.warn("[VThreads Background] 直连 CDN 响应异常或为 HTML 页面，自动切换为安全代理下载:", probeRes.status, ct);
        needsProxyFallback = true;
      }
    } catch (e) {
      console.warn("[VThreads Background] 直连 CDN 探测失败，启用代理兜底:", e);
      needsProxyFallback = true;
    }
  }

  if (needsProxyFallback) {
    if (proxyUrl) {
      targetUrl = proxyUrl;
    } else {
      targetUrl = `${API_BASE}/api/proxy?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}&vid=${encodeURIComponent(vid)}&client=extension`;
    }
  }

  // C. 触发 Chrome 下载
  return await startChromeDownload(targetUrl, filename);
}

function startChromeDownload(url, filename) {
  return new Promise((resolve, reject) => {
    if (chrome.downloads && chrome.downloads.download) {
      chrome.downloads.download(
        {
          url: url,
          filename: filename,
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("[VThreads Background] Chrome download error:", chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message || "浏览器下载失败"));
          } else {
            resolve({ success: true, downloadId });
          }
        }
      );
    } else {
      reject(new Error("浏览器不支持 chrome.downloads 接口"));
    }
  });
}

// 5. 监听来自 content script 与 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_VIDEO") {
    extractVideo(request.url)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 保持异步通信通道
  }

  if (request.action === "TRIGGER_DOWNLOAD") {
    executeDownload(request)
      .then((res) => sendResponse({ success: true, ...res }))
      .catch((err) => {
        console.error("[VThreads Background] Download error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});
