// VThreads Extension - Douyin In-Feed Injection Script

(() => {
  let activePopover = null;

  function scanAndInjectDouyin() {
    // 寻找包含 video 的抖音播放容器
    const videoContainers = document.querySelectorAll(
      'div[data-e2e="feed-active-video"], div[class*="slider-video"], div[class*="base-player-item"], div[class*="xgplayer"]'
    );

    videoContainers.forEach((container) => {
      // 避免重复注入
      let card = container.closest('div[class*="video-card"]') || container.parentElement;
      if (!card) card = container;

      if (card.querySelector(".vthreads-douyin-btn-wrap")) return;

      // 尝试获取视频唯一 URL
      let videoUrl = card.querySelector('a[href*="/video/"]')?.href;
      if (!videoUrl && window.location.pathname.includes("/video/")) {
        videoUrl = window.location.href;
      }
      if (!videoUrl) {
        // 抖音全屏流时使用当前页面地址
        videoUrl = window.location.href;
      }

      // 寻找右侧侧边栏互动区 (点赞、评论、收藏、分享按钮列)
      const actionCol =
        card.querySelector('div[class*="interactive-item"]')?.parentElement ||
        card.querySelector('div[data-e2e="feed-interactive-item"]')?.parentElement ||
        card.querySelector('div[class*="side-bar"]');

      if (!actionCol) return;

      // 创建下载按钮项
      const btnWrap = document.createElement("div");
      btnWrap.className = "vthreads-douyin-btn-wrap";

      const btn = document.createElement("button");
      btn.className = "vthreads-douyin-btn";
      btn.type = "button";
      btn.setAttribute("title", "VThreads 无水印原画下载");

      btn.innerHTML = `
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      `;

      const label = document.createElement("span");
      label.className = "vthreads-douyin-label";
      label.textContent = "下载";

      btnWrap.appendChild(btn);
      btnWrap.appendChild(label);

      btnWrap.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        closeActivePopover();
        btn.classList.add("is-loading");

        // 若 URL 未包含 video ID，从当前地址拉取
        const targetUrl = videoUrl.includes("/video/") ? videoUrl : window.location.href;

        try {
          // 优先就地嗅探本地激活的视频容器 (0 服务端 Cookie, 0 服务端风控)
          const local = sniffDouyinLocalMedia();
          if (local && local.info && local.info.medias?.length > 0) {
            btn.classList.remove("is-loading");
            showQualityPopover(btn, local.info, false, "");
            return;
          }

          const resp = await chrome.runtime.sendMessage({
            action: "EXTRACT_VIDEO",
            url: targetUrl
          });

          btn.classList.remove("is-loading");

          if (!resp || !resp.success) {
            alert("VThreads 解析提示: " + (resp?.error || "未能提取该抖音视频，请稍后重试"));
            return;
          }

          showQualityPopover(btn, resp.info, resp.isPro, resp.vid);
        } catch (err) {
          btn.classList.remove("is-loading");
          console.error("[VThreads Douyin] Error:", err);
          alert("提取失败，请检查网络或扩展状态");
        }
      });

      actionCol.appendChild(btnWrap);
    });
  }

  function showQualityPopover(anchorBtn, info, isPro, vid) {
    closeActivePopover();

    const rect = anchorBtn.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "vthreads-douyin-popover";

    const popoverWidth = 300;
    let left = rect.left + window.scrollX - popoverWidth - 12;
    if (left < 16) {
      left = rect.right + window.scrollX + 12;
    }

    let top = rect.top + window.scrollY - 30;
    if (top < 16) top = 16;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const titleText = info.title || "抖音无水印高清原画";
    const medias = info.medias || [];

    popover.innerHTML = `
      <div class="vthreads-douyin-pop-header">
        <div class="vthreads-douyin-pop-brand">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>VThreads 极速提取</span>
        </div>
        <button class="vthreads-douyin-pop-close">&times;</button>
      </div>
      <div class="vthreads-douyin-pop-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
      <div class="vthreads-douyin-formats-list"></div>
      <div class="vthreads-douyin-pop-toast">已加入下载队列 ✓</div>
    `;

    const listEl = popover.querySelector(".vthreads-douyin-formats-list");
    const toastEl = popover.querySelector(".vthreads-douyin-pop-toast");

    popover.querySelector(".vthreads-douyin-pop-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeActivePopover();
    });

    medias.forEach((m) => {
      const isAudio = m.format === "mp3" || /audio/i.test(m.quality);
      const qualityNum = parseInt(m.quality, 10) || 0;
      const isProLocked = !isPro && (qualityNum >= 1080 || /4k|60fps/i.test(m.quality));

      const row = document.createElement("div");
      row.className = "vthreads-douyin-format-row";
      row.innerHTML = `
        <div class="vthreads-douyin-format-tag">
          <span>${escapeHtml(m.quality || "无水印高清")}</span>
          <span class="${isProLocked ? "vthreads-douyin-pill-pro" : "vthreads-douyin-pill-free"}">
            ${isProLocked ? "PRO" : "FREE"}
          </span>
          <span class="vthreads-douyin-format-size">${m.format ? m.format.toUpperCase() : "MP4"}</span>
        </div>
        <button class="vthreads-douyin-btn-dl-row ${isProLocked ? "vthreads-douyin-btn-locked" : ""}" type="button">
          ${isProLocked ? "⚡ 开通 Pro" : "下载"}
        </button>
      `;

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isProLocked) {
          window.open("https://vthreads.top/zh/plans/", "_blank");
          closeActivePopover();
          return;
        }

        let dlUrl = m.raw_url || m.url || "";
        chrome.runtime.sendMessage({
          action: "TRIGGER_DOWNLOAD",
          url: dlUrl,
          vid: vid,
          filename: `douyin_${info.platform || "video"}_${m.quality || "hd"}.mp4`
        });

        toastEl.style.display = "block";
        setTimeout(() => {
          closeActivePopover();
        }, 1200);
      });

      listEl.appendChild(row);
    });

    document.body.appendChild(popover);
    activePopover = popover;
  }

  function closeActivePopover() {
    if (activePopover && activePopover.parentNode) {
      activePopover.parentNode.removeChild(activePopover);
      activePopover = null;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  document.addEventListener("click", (e) => {
    if (activePopover && !activePopover.contains(e.target)) {
      closeActivePopover();
    }
  });

  window.addEventListener("resize", closeActivePopover);

  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndInjectDouyin, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 响应来自 Extension Popup 的本地嗅探请求 (SNIFF_LOCAL_MEDIA)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SNIFF_LOCAL_MEDIA") {
      const res = sniffDouyinLocalMedia();
      sendResponse(res || { success: false });
      return true;
    }
  });

  function sniffDouyinLocalMedia() {
    try {
      const v = document.querySelector('div[data-e2e="feed-active-video"] video') || document.querySelector("video");
      const src = v?.currentSrc || v?.src || v?.querySelector("source")?.src || "";
      const title =
        document.querySelector('span[data-e2e="video-desc"]')?.textContent?.trim() ||
        document.title.replace(/- 抖音.*$/, "").trim() ||
        "douyin_video";

      if (src && /^https?:\/\//i.test(src)) {
        return {
          success: true,
          info: {
            title: title,
            platform: "douyin",
            medias: [
              {
                format: "mp4",
                quality: "原画",
                url: src,
                raw_url: src,
                size: ""
              }
            ]
          }
        };
      }
    } catch (e) {
      console.warn("[VThreads Douyin] Local sniff error:", e);
    }
    return null;
  }

  scanAndInjectDouyin();
})();
