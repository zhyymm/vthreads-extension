// VThreads Extension - Twitter / X Feed Injection Script

(() => {
  let activePopover = null;

  // 1. 扫描并注入下载按钮到推文动作栏
  function scanAndInject() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    tweets.forEach((tweet) => {
      // 避免重复注入
      if (tweet.querySelector(".vthreads-action-btn-wrap")) return;

      // 检查推文是否包含视频 / GIF
      const hasVideo = tweet.querySelector(
        'div[data-testid="videoPlayer"], div[data-testid="videoComponent"], video, [aria-label*="Play"], [aria-label*="播放"]'
      );
      if (!hasVideo) return;

      // 获取推文动作栏 (包含回复、转推、点赞等)
      const actionBar = tweet.querySelector('div[role="group"]');
      if (!actionBar) return;

      // 获取当前推文的专属详情页 URL
      const timeAnchor = tweet.querySelector("time")?.closest("a");
      let statusHref = timeAnchor ? timeAnchor.getAttribute("href") : "";
      if (!statusHref || !statusHref.includes("/status/")) {
        // 兜底：如果是当前正处于详情页的主推文
        if (window.location.pathname.includes("/status/")) {
          statusHref = window.location.pathname;
        } else {
          return;
        }
      }

      const tweetUrl = `https://x.com${statusHref.split("?")[0]}`;

      // 创建按钮容器
      const btnWrap = document.createElement("div");
      btnWrap.className = "vthreads-action-btn-wrap";

      const btn = document.createElement("button");
      btn.className = "vthreads-action-btn";
      btn.type = "button";
      btn.setAttribute("title", "VThreads 极速下载");
      btn.setAttribute("aria-label", "VThreads 极速下载");

      // 闪电/极速提取专属 SVG
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor"/>
        </svg>
      `;

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 关闭现有的弹窗
        closeActivePopover();

        btn.classList.add("is-loading");

        try {
          const resp = await chrome.runtime.sendMessage({
            action: "EXTRACT_VIDEO",
            url: tweetUrl
          });

          btn.classList.remove("is-loading");

          if (!resp || !resp.success) {
            alert("解析提示: " + (resp?.error || "未能获取视频信息，请稍后重试"));
            return;
          }

          // 打开画质选择弹窗
          showQualityPopover(btn, resp.info, resp.isPro, resp.vid);
        } catch (err) {
          btn.classList.remove("is-loading");
          console.error("[VThreads Twitter Injected] Error:", err);
          alert("提取失败，请检查扩展后台或网络连接");
        }
      });

      btnWrap.appendChild(btn);

      // 插入到操作栏中 (放在分享按钮前面或最后)
      actionBar.appendChild(btnWrap);
    });
  }

  // 2. 渲染画质选择悬浮卡片 (Popover)
  function showQualityPopover(anchorBtn, info, isPro, vid) {
    closeActivePopover();

    const rect = anchorBtn.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "vthreads-popover";

    // 计算弹窗绝对坐标
    const popoverWidth = 290;
    let left = rect.left + window.scrollX - 100;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    let top = rect.bottom + window.scrollY + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const titleText = info.title || "原画视频下载";
    const medias = info.medias || [];

    popover.innerHTML = `
      <div class="vthreads-pop-header">
        <div class="vthreads-pop-brand">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>VThreads 极速提取</span>
        </div>
        <button class="vthreads-pop-close">&times;</button>
      </div>
      <div class="vthreads-pop-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
      <div class="vthreads-formats-list"></div>
      <div class="vthreads-pop-toast">已加入下载队列 ✓</div>
    `;

    const listEl = popover.querySelector(".vthreads-formats-list");
    const toastEl = popover.querySelector(".vthreads-pop-toast");

    popover.querySelector(".vthreads-pop-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeActivePopover();
    });

    medias.forEach((m) => {
      const isAudio = m.format === "mp3" || /audio/i.test(m.quality);
      const qualityNum = parseInt(m.quality, 10) || 0;
      const isProLocked = !isPro && (qualityNum >= 1080 || /4k|60fps/i.test(m.quality));

      const row = document.createElement("div");
      row.className = "vthreads-format-row";
      row.innerHTML = `
        <div class="vthreads-format-tag">
          <span>${escapeHtml(m.quality || "HD")}</span>
          <span class="${isProLocked ? "vthreads-pill-pro" : "vthreads-pill-free"}">
            ${isProLocked ? "PRO" : "FREE"}
          </span>
          <span class="vthreads-format-size">${m.format ? m.format.toUpperCase() : "MP4"}</span>
        </div>
        <button class="vthreads-btn-dl-row ${isProLocked ? "vthreads-btn-locked" : ""}" type="button">
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

        // 优先直连 Twitter 官方高速 CDN（走用户本地家庭宽带，0 服务器流量）
        let dlUrl = m.raw_url || m.url || "";
        chrome.runtime.sendMessage({
          action: "TRIGGER_DOWNLOAD",
          url: dlUrl,
          vid: vid,
          filename: `twitter_${info.platform || "video"}_${m.quality || "hd"}.mp4`
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

  // 点击空白处关闭悬浮窗
  document.addEventListener("click", (e) => {
    if (activePopover && !activePopover.contains(e.target)) {
      closeActivePopover();
    }
  });

  // 页面缩放或滚动时关闭悬浮窗
  window.addEventListener("resize", closeActivePopover);

  // 3. 动态监测推特动态滚动流
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanAndInject();
    }, 250);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 首次运行
  scanAndInject();
})();
