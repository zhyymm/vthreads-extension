<div align="center">

<img src="icons/icon128.png" alt="VThreads Logo" width="96" height="96" />

# VThreads Video Downloader - Browser Extension

**One-Click HD Video & Media Downloader for Threads, X (Twitter), TikTok, Instagram, and More**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/version-1.0.3-orange.svg)](https://github.com/zhyymm/vthreads-extension/releases)
[![Website](https://img.shields.io/badge/Official%20Website-vthreads.top-6366f1.svg)](https://vthreads.top)
[![Chrome Web Store](https://img.shields.io/badge/Browser%20Support-Chrome%20%7C%20Edge%20%7C%20Brave-brightgreen.svg)](#installation)

[**Official Website (Web App)**](https://vthreads.top) • [**Report Bug**](https://github.com/zhyymm/vthreads-extension/issues) • [**Request Feature**](https://github.com/zhyymm/vthreads-extension/issues)

</div>

---

## 📖 Overview

**VThreads Extension** is a lightweight, privacy-focused open-source browser extension that seamlessly injects an instant **Download** button directly into social media feeds and post cards. 

Say goodbye to copying links, opening new tabs, and dealing with intrusive ads. With VThreads Extension, you can extract and download original crisp **1080P / 4K MP4 videos, audio tracks, and full-resolution image galleries** with a single click.

Powered by the high-speed parsing engine at [VThreads.top](https://vthreads.top).

---

## ✨ Features

- ⚡ **One-Click Instant Download**: Smart buttons seamlessly embedded into Threads, X (Twitter), TikTok, Instagram, and Douyin cards.
- 🎬 **Highest Resolution Guarantee**: Extracts original uncompressed MP4 video files (720P, 1080P, 4K UHD) with crystal-clear audio.
- 💧 **Zero Watermark**: Downloads clean media without platform watermarks or branding overlays.
- 🛡️ **Privacy-First & No Tracking**: 100% open-source, zero analytics trackers, no browsing history logging, and no unnecessary permissions.
- 🚀 **Manifest V3 Compliant**: Built strictly according to Google Chrome's latest Manifest V3 security and performance standards.
- 🎨 **Native Theme Matching**: Adaptive UI design that automatically blends into dark mode and light mode across all supported social platforms.

---

## 🌐 Supported Platforms

| Platform | In-Feed Button | Max Quality | Supported Content |
| :--- | :---: | :---: | :--- |
| **Meta Threads** (`threads.net`) | ✅ Yes | 1080P HD | Videos, Carousels, Photos |
| **X / Twitter** (`x.com` / `twitter.com`) | ✅ Yes | 1080P HD / 4K | Clips, Video Posts, GIFs |
| **TikTok** (`tiktok.com`) | ✅ Yes | Original HD | Watermark-free Videos, Audios |
| **Instagram** (`instagram.com`) | ✅ Yes | 1080P HD | Reels, Feed Videos, Stories |
| **Douyin** (`douyin.com`) | ✅ Yes | 1080P HD | Short Videos, Music, Live Photos |
| **Bilibili** (`bilibili.com`) | ✅ Yes | 1080P / 4K | Bangumi, UGC Videos |

> Need to parse links from other platforms (YouTube, Reddit, Facebook, Pinterest, Kuaishou, etc.)? You can directly use our [Universal Web Downloader](https://vthreads.top).

---

## 🛠️ Installation

### Method: Load Unpacked in Developer Mode (Chrome, Edge, Brave, Opera)

1. **Download the source code**:
   - Clone this repository or download the ZIP archive:
     ```bash
     git clone https://github.com/zhyymm/vthreads-extension.git
     ```
2. **Open the Extension Management Page**:
   - In Chrome / Brave: navigate to `chrome://extensions/`
   - In Microsoft Edge: navigate to `edge://extensions/`
3. **Enable Developer Mode**:
   - Toggle the switch labeled **"Developer mode"** in the top right corner.
4. **Load the Extension**:
   - Click the **"Load unpacked"** (加载已解压的扩展程序) button in the top left.
   - Select the `vthreads-extension` folder.
5. **Done!**
   - Pin the VThreads icon to your toolbar. Browse Threads, Twitter/X, TikTok, or Instagram, and enjoy instant one-click download buttons!

---

## 🔒 Privacy & Permissions

VThreads Extension respects your digital privacy:
- `activeTab`: Used solely to detect current post URL when you click the extension popup.
- `declarativeNetRequest`: Used strictly to bypass cross-origin header restrictions when downloading streaming media chunks.
- `downloads`: Used to save the extracted MP4 files directly to your default browser downloads folder.
- **Zero data collection**: We do not collect, store, sell, or analyze your personal browsing history.

---

## 🤝 Open Source & Contributing

Contributions are warmly welcomed! If you'd like to add support for a new website, improve UI styles, or report bugs:

1. Fork the Project (`https://github.com/zhyymm/vthreads-extension/fork`)
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add support for platform X'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - feel free to use, modify, and distribute it freely.

---

<div align="center">

Made with ❤️ by the **[VThreads](https://vthreads.top)** Team • *The fastest & cleanest online video downloader.*

</div>
