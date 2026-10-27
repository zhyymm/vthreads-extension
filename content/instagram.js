// VThreads Extension - Instagram In-Feed Injection Script

(() => {
  let activePopover = null;

  function scanAndInjectInstagram() {
    // 寻找包含 video 的文章或 Reels 播放器
    const articles = document.querySelectorAll("article, div[role='dialog']");

    articles.forEach((art) => {
      const video = art.querySelector("video");
      if (!video) return;

      if (art.querySelector(".vthreads-instagram-btn-wrap")) return;

      // 寻找帖子专属链接 /p/XXXXX 或 /reel/XXXXX
      let postLink = art.querySelector('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute("href");
      if (!postLink && (window.location.pathname.includes("/p/") || window.location.pathname.includes("/reel/"))) {
        postLink = window.location.pathname;
      }
      if (!postLink) return;

      const fullUrl = postLink.startsWith("http")
        ? postLink
        : `https://www.instagram.com${postLink.split("?")[0]}`;

      // 寻找底部动作栏 (包含心形、气泡、纸飞机的 section)
      const actionSection = art.querySelector("section");
      if (!actionSection) return;

      const btnWrap = document.createElement("div");
      btnWrap.className = "vthreads-instagram-btn-wrap";

      const btn = document.createElement("button");
      btn.className = "vthreads-instagram-btn";
      btn.type = "button";
      btn.setAttribute("title", "VThreads 极速下载");

      btn.innerHTML = `
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      `;

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        closeActivePopover();
        btn.classList.add("is-loading");

        try {
          const resp = await chrome.runtime.sendMessage({
            action: "EXTRACT_VIDEO",
            url: fullUrl
          });

          btn.classList.remove("is-loading");

          if (!resp || !resp.success) {
            alert("VThreads 解析提示: " + (resp?.error || "未能提取该 Instagram 视频"));
            return;
          }

          showQualityPopover(btn, resp.info, resp.isPro, resp.vid);
        } catch (err) {
          btn.classList.remove("is-loading");
          console.error("[VThreads Instagram] Error:", err);
          alert("提取失败，请检查网络或扩展状态");
        }
      });

      btnWrap.appendChild(btn);
      actionSection.appendChild(btnWrap);
    });
  }

  function showQualityPopover(anchorBtn, info, isPro, vid) {
    closeActivePopover();

    const rect = anchorBtn.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "vthreads-instagram-popover";

    const popoverWidth = 300;
    let left = rect.left + window.scrollX - 100;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    let top = rect.bottom + window.scrollY + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const titleText = info.title || "Instagram 原画视频";
    const medias = info.medias || [];

    popover.innerHTML = `
      <div class="vthreads-instagram-pop-header">
        <div class="vthreads-instagram-pop-brand">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>VThreads 极速提取</span>
        </div>
        <button class="vthreads-instagram-pop-close">&times;</button>
      </div>
      <div class="vthreads-instagram-pop-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
      <div class="vthreads-instagram-formats-list"></div>
      <div class="vthreads-instagram-pop-toast">已加入下载队列 ✓</div>
    `;

    const listEl = popover.querySelector(".vthreads-instagram-formats-list");
    const toastEl = popover.querySelector(".vthreads-instagram-pop-toast");

    popover.querySelector(".vthreads-instagram-pop-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeActivePopover();
    });

    medias.forEach((m) => {
      const isAudio = m.format === "mp3" || /audio/i.test(m.quality);
      const qualityNum = parseInt(m.quality, 10) || 0;
      const isProLocked = !isPro && (qualityNum >= 1080 || /4k|60fps/i.test(m.quality));

      const row = document.createElement("div");
      row.className = "vthreads-instagram-format-row";
      row.innerHTML = `
        <div class="vthreads-instagram-format-tag">
          <span>${escapeHtml(m.quality || "原画超清")}</span>
          <span class="${isProLocked ? "vthreads-instagram-pill-pro" : "vthreads-instagram-pill-free"}">
            ${isProLocked ? "PRO" : "FREE"}
          </span>
          <span class="vthreads-instagram-format-size">${m.format ? m.format.toUpperCase() : "MP4"}</span>
        </div>
        <button class="vthreads-instagram-btn-dl-row ${isProLocked ? "vthreads-instagram-btn-locked" : ""}" type="button">
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

        // 优先直连 Instagram 官方高速 CDN（走用户本地家庭宽带，0 服务器流量）
        let dlUrl = m.raw_url || m.url || "";
        chrome.runtime.sendMessage({
          action: "TRIGGER_DOWNLOAD",
          url: dlUrl,
          vid: vid,
          filename: `instagram_${info.platform || "video"}_${m.quality || "hd"}.mp4`
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
    scanTimer = setTimeout(scanAndInjectInstagram, 350);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  scanAndInjectInstagram();
})();
