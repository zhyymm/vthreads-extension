// VThreads Extension - TikTok In-Feed Injection Script

(() => {
  let activePopover = null;

  function scanAndInjectTikTok() {
    // 寻找 TikTok 推荐流或视频容器
    const videoContainers = document.querySelectorAll(
      'div[data-e2e="recommend-list-item-container"], div[class*="DivItemContainer"], div[data-e2e="feed-video"], div[class*="DivVideoFeed"]'
    );

    videoContainers.forEach((container) => {
      if (container.querySelector(".vthreads-tiktok-btn-wrap")) return;

      // 获取视频唯一链接
      let videoUrl = container.querySelector('a[href*="/video/"]')?.href;
      if (!videoUrl && window.location.pathname.includes("/video/")) {
        videoUrl = window.location.href;
      }
      if (!videoUrl) return;

      // 寻找右侧侧边栏互动区 (点赞、评论、收藏、分享按钮列)
      const actionCol =
        container.querySelector('div[class*="ActionItemContainer"]') ||
        container.querySelector('div[class*="DivActionItemContainer"]') ||
        container.querySelector('div[data-e2e="feed-action-item"]')?.parentElement;

      if (!actionCol) return;

      // 创建下载按钮项
      const btnWrap = document.createElement("div");
      btnWrap.className = "vthreads-tiktok-btn-wrap";

      const btn = document.createElement("button");
      btn.className = "vthreads-tiktok-btn";
      btn.type = "button";
      btn.setAttribute("title", "VThreads 无水印原画下载");

      btn.innerHTML = `
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      `;

      const label = document.createElement("span");
      label.className = "vthreads-tiktok-label";
      label.textContent = "下载";

      btnWrap.appendChild(btn);
      btnWrap.appendChild(label);

      btnWrap.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        closeActivePopover();
        btn.classList.add("is-loading");

        try {
          const resp = await chrome.runtime.sendMessage({
            action: "EXTRACT_VIDEO",
            url: videoUrl
          });

          btn.classList.remove("is-loading");

          if (!resp || !resp.success) {
            alert("VThreads 解析提示: " + (resp?.error || "未能提取该 TikTok 视频，请稍后重试"));
            return;
          }

          showQualityPopover(btn, resp.info, resp.isPro, resp.vid);
        } catch (err) {
          btn.classList.remove("is-loading");
          console.error("[VThreads TikTok] Error:", err);
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
    popover.className = "vthreads-tiktok-popover";

    const popoverWidth = 300;
    let left = rect.left + window.scrollX - popoverWidth - 12;
    if (left < 16) {
      left = rect.right + window.scrollX + 12;
    }

    let top = rect.top + window.scrollY - 40;
    if (top < 16) top = 16;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const titleText = info.title || "TikTok 无水印原画视频";
    const medias = info.medias || [];

    popover.innerHTML = `
      <div class="vthreads-tiktok-pop-header">
        <div class="vthreads-tiktok-pop-brand">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>VThreads 极速提取</span>
        </div>
        <button class="vthreads-tiktok-pop-close">&times;</button>
      </div>
      <div class="vthreads-tiktok-pop-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
      <div class="vthreads-tiktok-formats-list"></div>
      <div class="vthreads-tiktok-pop-toast">已加入下载队列 ✓</div>
    `;

    const listEl = popover.querySelector(".vthreads-tiktok-formats-list");
    const toastEl = popover.querySelector(".vthreads-tiktok-pop-toast");

    popover.querySelector(".vthreads-tiktok-pop-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeActivePopover();
    });

    medias.forEach((m) => {
      const isAudio = m.format === "mp3" || /audio/i.test(m.quality);
      const qualityNum = parseInt(m.quality, 10) || 0;
      const isProLocked = !isPro && (qualityNum >= 1080 || /4k|60fps/i.test(m.quality));

      const row = document.createElement("div");
      row.className = "vthreads-tiktok-format-row";
      row.innerHTML = `
        <div class="vthreads-tiktok-format-tag">
          <span>${escapeHtml(m.quality || "无水印高清")}</span>
          <span class="${isProLocked ? "vthreads-tiktok-pill-pro" : "vthreads-tiktok-pill-free"}">
            ${isProLocked ? "PRO" : "FREE"}
          </span>
          <span class="vthreads-tiktok-format-size">${m.format ? m.format.toUpperCase() : "MP4"}</span>
        </div>
        <button class="vthreads-tiktok-btn-dl-row ${isProLocked ? "vthreads-tiktok-btn-locked" : ""}" type="button">
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

        // 优先直连 TikTok 官方高速 CDN（走用户本地家庭宽带，0 服务器流量）
        let dlUrl = m.raw_url || m.url || "";
        chrome.runtime.sendMessage({
          action: "TRIGGER_DOWNLOAD",
          url: dlUrl,
          vid: vid,
          filename: `tiktok_${info.platform || "video"}_${m.quality || "hd"}.mp4`
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
    scanTimer = setTimeout(scanAndInjectTikTok, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  scanAndInjectTikTok();
})();
