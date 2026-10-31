// VThreads Extension - Reddit In-Page Injection & Zero-Cookie Local Sniffing Script

(() => {
  let activePopover = null;

  // 1. 尝试从单条 Reddit 帖子中就地解析高清视频（走浏览器本地网络 + 本地 Cookie，0 依赖服务器端 Cookie，0 服务端封禁）
  async function extractRedditVideoFromPost(postEl, postUrl) {
    try {
      const cleanUrl = (postUrl || window.location.href).split("?")[0].replace(/\/$/, "");

      // 提取标题
      let title = "";
      if (postEl) {
        title =
          postEl.getAttribute("post-title") ||
          postEl.querySelector('[slot="title"]')?.textContent?.trim() ||
          postEl.querySelector("h1")?.textContent?.trim() ||
          postEl.querySelector('a[slot="full-post-link"]')?.textContent?.trim() ||
          "";
      }
      if (!title) {
        title = document.querySelector("h1")?.textContent?.trim() || document.title.replace(/ : r\/\w+.*$/, "").trim() || "Reddit_Video";
      }

      // 提取封面
      let thumbnail = "";
      const player = postEl ? postEl.querySelector("shreddit-player, shreddit-player-2") : document.querySelector("shreddit-player, shreddit-player-2");
      if (player) {
        thumbnail = player.getAttribute("preview") || player.getAttribute("poster") || "";
      }

      let medias = [];

      // 方法 A：从 <shreddit-player> 的 packaged-media-json 属性中就地嗅探（通常为官方打包好的单流 MP4，音视频完整，0 需服务器合并）
      if (player) {
        const packagedJson = player.getAttribute("packaged-media-json");
        if (packagedJson) {
          try {
            const parsed = JSON.parse(packagedJson);
            const mediaList = parsed.playbackMp4s?.permutations || parsed.playbackMp4s || parsed;
            if (Array.isArray(mediaList) && mediaList.length > 0) {
              mediaList.forEach((item) => {
                const itemUrl = item.source?.url || item.url || "";
                if (itemUrl && /^https?:\/\//i.test(itemUrl)) {
                  const h = item.source?.dimensions?.height || item.height || 720;
                  medias.push({
                    format: "mp4",
                    quality: `${h}p`,
                    url: itemUrl,
                    raw_url: itemUrl,
                    size: ""
                  });
                }
              });
            }
          } catch (e) {
            console.debug("[VThreads Reddit] packaged-media-json parse fallback:", e);
          }
        }

        // 检查 direct src
        const directSrc = player.getAttribute("src") || player.getAttribute("stream-url");
        if (directSrc && directSrc.includes(".mp4")) {
          medias.push({
            format: "mp4",
            quality: "HD",
            url: directSrc,
            raw_url: directSrc,
            size: ""
          });
        }
      }

      // 方法 B：如果未嗅探到直接 MP4，且在 Reddit 页面中，直接利用浏览器的同源凭据（credentials: include）请求帖子 .json 端点
      if (medias.length === 0 && cleanUrl.includes("/comments/")) {
        try {
          const jsonEndpoint = `${cleanUrl}.json`;
          const resp = await fetch(jsonEndpoint, { credentials: "include" });
          if (resp.ok) {
            const data = await resp.json();
            const postObj = data?.[0]?.data?.children?.[0]?.data;
            if (postObj) {
              if (!title) title = postObj.title || "Reddit_Video";
              if (!thumbnail) thumbnail = postObj.thumbnail || "";

              const redditVideo =
                postObj.secure_media?.reddit_video ||
                postObj.media?.reddit_video ||
                postObj.crosspost_parent_list?.[0]?.secure_media?.reddit_video ||
                postObj.crosspost_parent_list?.[0]?.media?.reddit_video;

              if (redditVideo) {
                const fallbackUrl = redditVideo.fallback_url || "";
                const height = redditVideo.height || 720;
                const cleanFallback = fallbackUrl.split("?")[0];
                const baseCdn = cleanFallback.substring(0, cleanFallback.lastIndexOf("/"));
                const audioUrl = `${baseCdn}/DASH_AUDIO_128.mp4`;

                // 1. 服务端音视频合并流（针对 DASH 分离流）
                const mergeUrl = `https://vthreads.top/api/download_merge?video_url=${encodeURIComponent(
                  fallbackUrl
                )}&audio_url=${encodeURIComponent(audioUrl)}&title=${encodeURIComponent(title)}`;

                medias.push({
                  format: "merge",
                  quality: `${height}p 原画`,
                  url: mergeUrl,
                  raw_url: mergeUrl,
                  size: ""
                });

                // 2. 纯音频提取
                medias.push({
                  format: "mp3",
                  quality: "Audio 128k",
                  url: audioUrl,
                  raw_url: audioUrl,
                  size: ""
                });
              }
            }
          }
        } catch (err) {
          console.warn("[VThreads Reddit] Local .json fetch warning:", err);
        }
      }

      // 方法 C：从 DOM <video> 标签中获取
      if (medias.length === 0) {
        const vEl = postEl ? postEl.querySelector("video") : document.querySelector("video");
        if (vEl && vEl.src && /^https?:\/\//i.test(vEl.src)) {
          medias.push({
            format: "mp4",
            quality: "HD",
            url: vEl.src,
            raw_url: vEl.src,
            size: ""
          });
        }
      }

      if (medias.length > 0) {
        return {
          success: true,
          info: {
            title: title.slice(0, 100),
            platform: "reddit",
            thumbnail: thumbnail,
            medias: medias
          }
        };
      }
    } catch (e) {
      console.warn("[VThreads Reddit] Local extract error:", e);
    }
    return null;
  }

  // 2. 扫描并向 Reddit 信息流注入下载按钮
  function scanAndInjectReddit() {
    // 现代 Reddit (shreddit-post) 列表及详情页
    const posts = document.querySelectorAll("shreddit-post");
    posts.forEach((post) => {
      if (post.querySelector(".vthreads-reddit-btn-wrap")) return;

      // 仅针对视频帖子注入
      const isVideo =
        post.getAttribute("post-type") === "video" ||
        post.querySelector("shreddit-player, shreddit-player-2, video, [data-testid='post-container'] video");

      if (!isVideo) return;

      // 寻找操作栏 actions 插槽
      const actionBar =
        post.querySelector('[slot="actions"]') ||
        post.querySelector(".actions-wrap") ||
        post.querySelector("div[slot='credit-bar']");

      if (!actionBar) return;

      const permalink = post.getAttribute("permalink") || post.getAttribute("content-href") || "";
      const postUrl = permalink ? `https://www.reddit.com${permalink}` : window.location.href;

      const btnWrap = document.createElement("div");
      btnWrap.className = "vthreads-reddit-btn-wrap";

      const btn = document.createElement("button");
      btn.className = "vthreads-reddit-btn";
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
          // 第一步：优先尝试本地 0 Cookie 就地嗅探
          let result = await extractRedditVideoFromPost(post, postUrl);

          // 第二步：若本地未嗅探出，回退至扩展后台调用服务端解析
          if (!result || !result.info?.medias?.length) {
            const resp = await chrome.runtime.sendMessage({
              action: "EXTRACT_VIDEO",
              url: postUrl
            });
            if (resp && resp.success) {
              result = { success: true, info: resp.info, isPro: resp.isPro, vid: resp.vid };
            }
          }

          btn.classList.remove("is-loading");

          if (!result || !result.info) {
            alert("VThreads 提示: 未能成功提取该 Reddit 视频，请稍后重试。");
            return;
          }

          showQualityPopover(btn, result.info, result.isPro, result.vid);
        } catch (err) {
          btn.classList.remove("is-loading");
          console.error("[VThreads Reddit] Error:", err);
          alert("提取遇到异常，请检查网络");
        }
      });

      btnWrap.appendChild(btn);
      actionBar.appendChild(btnWrap);
    });
  }

  // 3. 渲染高清清晰度选择悬浮卡片
  function showQualityPopover(anchorBtn, info, isPro, vid) {
    closeActivePopover();

    const rect = anchorBtn.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "vthreads-popover";

    const popoverWidth = 300;
    let left = rect.left + window.scrollX - 80;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    let top = rect.bottom + window.scrollY + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    const titleText = info.title || "Reddit 原画视频";
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
          ${isProLocked ? "⚡ 解锁" : "下载"}
        </button>
      `;

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isProLocked) {
          window.open("https://vthreads.top/zh/plans/", "_blank");
          closeActivePopover();
          return;
        }

        // 优先直连平台官方 CDN（走用户本地家庭宽带，0 服务器流量）
        let dlUrl = (m.format === "merge" || (m.url && m.url.includes("/api/download_merge"))) ? m.url : (m.raw_url || m.url || "");
        const cleanTitle = (info.title || "reddit_video").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 50);

        chrome.runtime.sendMessage({
          action: "TRIGGER_DOWNLOAD",
          url: dlUrl,
          vid: vid,
          filename: `${cleanTitle}_${m.quality || "hd"}.${isAudio ? "mp3" : "mp4"}`
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

  // 4. 响应来自 Extension Popup 的本地嗅探请求 (SNIFF_LOCAL_MEDIA)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SNIFF_LOCAL_MEDIA") {
      extractRedditVideoFromPost(null, request.url || window.location.href).then((result) => {
        sendResponse(result || { success: false });
      });
      return true;
    }
  });

  // 5. 动态监视 DOM 变化
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanAndInjectReddit();
    }, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  scanAndInjectReddit();
})();

