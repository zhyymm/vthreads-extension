// VThreads Extension - Bilibili In-Page Injection Script

(() => {
  let activePopover = null;

  function scanAndInjectBilibili() {
    // 1. 视频详情页工具栏注入 (点赞、投币、收藏行)
    const toolbar =
      document.querySelector("#arc_toolbar_report .video-toolbar-left") ||
      document.querySelector("#arc_toolbar_report .toolbar-left") ||
      document.querySelector("#arc_toolbar_report") ||
      document.querySelector(".video-toolbar-left");

    if (toolbar && !toolbar.querySelector(".vthreads-bili-btn-wrap")) {
      const btnWrap = document.createElement("div");
      btnWrap.className = "vthreads-bili-btn-wrap";

      const btn = document.createElement("button");
      btn.className = "vthreads-bili-btn";
      btn.type = "button";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span>极速下载</span>
      `;

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        closeActivePopover();
        btn.classList.add("is-loading");

        try {
          // 优先就地嗅探本地页面中的 playinfo (0 服务端 Cookie, 0 服务端风控)
          const localInfo = sniffBilibiliPlayinfo();
          if (localInfo && localInfo.info && localInfo.info.medias && localInfo.info.medias.length > 0) {
            btn.classList.remove("is-loading");
            showQualityPopover(btn, localInfo.info, false, "");
            return;
          }

          const resp = await chrome.runtime.sendMessage({
            action: "EXTRACT_VIDEO",
            url: window.location.href
          });

          btn.classList.remove("is-loading");

          if (!resp || !resp.success) {
            alert("VThreads 解析提示: " + (resp?.error || "未能提取该 B 站视频"));
            return;
          }

          showQualityPopover(btn, resp.info, resp.isPro, resp.vid);
        } catch (err) {
          btn.classList.remove("is-loading");
          console.error("[VThreads Bilibili] Error:", err);
          alert("提取失败，请检查网络或扩展状态");
        }
      });

      btnWrap.appendChild(btn);
      toolbar.appendChild(btnWrap);
    }

    // 2. 动态信息流注入 (bilibili.com/opus 或 t.bilibili.com)
    const dynCards = document.querySelectorAll(".bili-dyn-item, .bili-dyn-card-video");
    dynCards.forEach((card) => {
      if (card.querySelector(".vthreads-bili-btn-wrap")) return;

      const videoLink = card.querySelector('a[href*="/video/BV"]')?.href;
      const actionRow = card.querySelector(".bili-dyn-item__action, .bili-dyn-action");

      if (videoLink && actionRow) {
        const btnWrap = document.createElement("div");
        btnWrap.className = "vthreads-bili-btn-wrap";

        const btn = document.createElement("button");
        btn.className = "vthreads-bili-btn";
        btn.type = "button";
        btn.innerHTML = `
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>下载</span>
        `;

        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          closeActivePopover();
          btn.classList.add("is-loading");

          try {
            const resp = await chrome.runtime.sendMessage({
              action: "EXTRACT_VIDEO",
              url: videoLink
            });

            btn.classList.remove("is-loading");

            if (!resp || !resp.success) {
              alert("VThreads 解析提示: " + (resp?.error || "未能提取该视频"));
              return;
            }

            showQualityPopover(btn, resp.info, resp.isPro, resp.vid);
          } catch (err) {
            btn.classList.remove("is-loading");
            console.error("[VThreads Bilibili Dyn] Error:", err);
            alert("提取失败");
          }
        });

        btnWrap.appendChild(btn);
        actionRow.appendChild(btnWrap);
      }
    });
  }

  function showQualityPopover(anchorBtn, info, isPro, vid) {
    closeActivePopover();

    const rect = anchorBtn.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "vthreads-bili-popover";

    const popoverWidth = 310;
    let left = rect.left + window.scrollX;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    let top = rect.bottom + window.scrollY + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const titleText = info.title || "哔哩哔哩高清原画视频";
    const medias = info.medias || [];

    popover.innerHTML = `
      <div class="vthreads-bili-pop-header">
        <div class="vthreads-bili-pop-brand">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>VThreads 极速提取</span>
        </div>
        <button class="vthreads-bili-pop-close">&times;</button>
      </div>
      <div class="vthreads-bili-pop-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
      <div class="vthreads-bili-formats-list"></div>
      <div class="vthreads-bili-pop-toast">已加入下载队列 ✓</div>
    `;

    const listEl = popover.querySelector(".vthreads-bili-formats-list");
    const toastEl = popover.querySelector(".vthreads-bili-pop-toast");

    popover.querySelector(".vthreads-bili-pop-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeActivePopover();
    });

    medias.forEach((m) => {
      const isAudio = m.format === "mp3" || /audio/i.test(m.quality);
      const qualityNum = parseInt(m.quality, 10) || 0;
      const isProLocked = !isPro && (qualityNum >= 1080 || /4k|60fps/i.test(m.quality));

      const row = document.createElement("div");
      row.className = "vthreads-bili-format-row";
      row.innerHTML = `
        <div class="vthreads-bili-format-tag">
          <span>${escapeHtml(m.quality || "原画")}</span>
          <span class="${isProLocked ? "vthreads-bili-pill-pro" : "vthreads-bili-pill-free"}">
            ${isProLocked ? "PRO" : "FREE"}
          </span>
          <span class="vthreads-bili-format-size">${m.format ? m.format.toUpperCase() : "MP4"}</span>
        </div>
        <button class="vthreads-bili-btn-dl-row ${isProLocked ? "vthreads-bili-btn-locked" : ""}" type="button">
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
        const cleanTitle = (info.title || "bilibili_video")
          .replace(/[/\\?%*:|"<>]/g, "_")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
        const filename = `${cleanTitle}_${m.quality || "hd"}.mp4`;

        chrome.runtime.sendMessage(
          {
            action: "TRIGGER_DOWNLOAD",
            url: dlUrl,
            vid: vid,
            filename: filename
          },
          (resp) => {
            if (resp && !resp.success) {
              alert("VThreads 下载提示: " + (resp.error || "下载失败，请稍后重试"));
            }
          }
        );

        toastEl.textContent = dlUrl.includes("/api/download_merge")
          ? "正在后台合并高清音视频，稍后将自动开始下载..."
          : "已加入下载队列 ✓";
        toastEl.style.display = "block";
        setTimeout(() => {
          closeActivePopover();
        }, 1800);
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
    scanTimer = setTimeout(scanAndInjectBilibili, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 响应来自 Extension Popup 的本地嗅探请求 (SNIFF_LOCAL_MEDIA)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SNIFF_LOCAL_MEDIA") {
      const res = sniffBilibiliPlayinfo();
      sendResponse(res || { success: false });
      return true;
    }
  });

  function sniffBilibiliPlayinfo() {
    try {
      const scripts = document.querySelectorAll("script");
      let playinfo = null;
      let title =
        document.querySelector("h1.video-title")?.textContent?.trim() ||
        document.querySelector(".video-title")?.textContent?.trim() ||
        document.title.replace(/_哔哩哔哩.*$/, "").trim() ||
        "bilibili_video";

      for (const s of scripts) {
        const text = s.textContent || "";
        if (text.includes("window.__playinfo__=")) {
          try {
            const raw = text.split("window.__playinfo__=")[1].split("</script>")[0].split(";\n")[0].split(";var")[0];
            playinfo = JSON.parse(raw.trim().replace(/;$/, ""));
            break;
          } catch (e) {}
        }
      }

      if (playinfo && playinfo.data && playinfo.data.dash) {
        const dash = playinfo.data.dash;
        const videoList = dash.video || [];
        const audioList = dash.audio || [];
        const bestAudio = audioList[0]?.baseUrl || audioList[0]?.backupUrl?.[0] || "";

        const medias = [];
        const seenQuality = new Set();

        videoList.forEach((v) => {
          const q = v.id || 80;
          let qName = "1080P";
          if (q >= 116) qName = "4K";
          else if (q >= 80) qName = "1080P";
          else if (q >= 64) qName = "720P";
          else qName = "480P";

          if (!seenQuality.has(qName)) {
            seenQuality.add(qName);
            const vUrl = v.baseUrl || v.backupUrl?.[0] || "";
            if (vUrl) {
              const mergeUrl = `https://vthreads.top/api/download_merge?video_url=${encodeURIComponent(
                vUrl
              )}&audio_url=${encodeURIComponent(bestAudio)}&title=${encodeURIComponent(title)}`;

              medias.push({
                format: "merge",
                quality: qName,
                url: mergeUrl,
                raw_url: mergeUrl,
                size: ""
              });
            }
          }
        });

        if (bestAudio) {
          medias.push({
            format: "mp3",
            quality: "Audio 128k",
            url: bestAudio,
            raw_url: bestAudio,
            size: ""
          });
        }

        if (medias.length > 0) {
          return {
            success: true,
            info: {
              title: title,
              platform: "bilibili",
              medias: medias
            }
          };
        }
      }
    } catch (err) {
      console.warn("[VThreads Bilibili] Local sniff error:", err);
    }
    return null;
  }

  scanAndInjectBilibili();
})();
