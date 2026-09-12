# ❄️ 冰凌の小栈 · 在线工具集

> 在 0 和 1 的世界里，种一朵花。  
> 这里是我写代码、记生活、分享温柔的地方。

<p align="center">
  <img src="/assets/Ice-lyn.jpg" width="120" style="border-radius: 50%; box-shadow: 0 8px 20px rgba(232,141,155,0.3);" alt="avatar">
</p>

---

## ✨ 项目简介

**冰凌の小栈** 是一个轻量级的 **在线工具集** 个人网站。  
整体风格温柔可爱（🌸 樱花飘落 + 🧊 冰凌元素），但技术底子并不含糊 —— 基于 **纯前端 + 云函数（EdgeOne Pages）** 实现动态交互，包括：

- 🛠️ 实用工具集（图片编辑、TTS 语音合成、AI 图片生成等）
- 👁️ 访问统计（API 驱动，实时更新）

> 💗 **本项目由 DS酱（DeepSeek）协助开发**，从架构设计到代码实现都有它的智慧参与。

---

## 🧊 技术栈（40% 硬核部分）

| 模块 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML5 / CSS3 / JavaScript | 响应式设计，毛玻璃效果，樱花飘落动画 |
| 工具集成 | Pollinations.ai / 第三方 TTS API | AI 绘图、语音合成 |
| 构建工具 | 无（纯静态） | 直接部署，零依赖打包 |
| 部署平台 | Tencent EdgeOne Pages | 支持边缘函数 + 静态托管 |

---

## 📁 项目结构

```

Ice-lyn.online/
├── index.html               # 首页（个人介绍 + 工具卡片）
├── tools/                   # 工具模块
│   ├── index.html           # 工具列表页（标签筛选、分页）
│   ├── toolData.json        # 工具元数据
│   └── tool/                # 每个工具的独立页面
│       ├── 001.html         # 图片编辑器
│       ├── 002.html         # TTS 语音合成
│       └── 003.html         # AI 图片生成器
├── lib/                     # 公共样式与脚本
│   ├── all.css              # 全局样式（樱花、毛玻璃、响应式）
│   └── all.js               # 公共逻辑（樱花飘落、汉堡菜单、回到顶部）
├── edge-functions/          # 边缘函数（API 层）
├── edgeone.json             # EdgeOne 路由配置
└── favicon.ico              # 小冰凌图标

```

---

## 🎨 核心功能亮点（60% 可爱部分）

### 🛠️ 工具集（持续扩充）
| 工具 | 技术/API | 特色 |
|------|----------|------|
| 🖼️ 在线图片编辑器 | Cropper.js + Canvas | 裁剪、旋转、滤镜、调整亮度/对比度/饱和度、尺寸预设 |
| 🔊 TTS 语音合成 | api.milorapart.top | 多音色选择、自动播放、下载音频、复制链接 |
| 🎨 AI 图片生成器 | Pollinations.ai | 输入 Prompt、选择尺寸/模型/种子、无 Referrer 匿名请求 |

### 🌸 视觉与体验
- **樱花飘落动画**：页面加载后自动飘落 🌸💮🌷，氛围感拉满。
- **毛玻璃卡片**：所有卡片均带半透明背景 + 模糊效果，柔和护眼。
- **响应式布局**：手机、平板、PC 均适配，移动端汉堡菜单。
- **AOS 滚动动画**：元素随滚动优雅出现。

---

## 🚀 快速部署（EdgeOne Pages）

本项目专为 **Tencent EdgeOne Pages** 优化，支持边缘函数与静态托管。

### 1. 准备工作
- 注册 [EdgeOne Pages](https://pages.edgeone.ai/)
- 创建项目，选择「从 Git 仓库导入」或「直接上传」

### 2. 部署
- 将整个项目推送到 GitHub / GitLab
- 在 EdgeOne Pages 中关联仓库，选择分支
- 构建命令留空（纯静态）
- 输出目录：`/`（根目录）
- 点击部署，✨ 几分钟后即可访问

> 💡 本地开发可直接用 `npx http-server` 预览静态部分。

---

## 📜 开源 & 致谢

- **字体**：Google Fonts（Quicksand + Noto Sans SC + Noto Serif SC）
- **图标库**：Font Awesome 6
- **动画库**：AOS.js
- **图片裁剪**：Cropper.js
- **AI 图片 API**：Pollinations.ai（免费、无需 API Key）
- **TTS API**：api.milorapart.top（感谢提供免费语音合成）

---

## 💌 写在最后

这个项目始于一个温柔的念头：想有一个属于自己的小地方，既能写技术笔记，又能存放好玩的小工具，还要长得可爱。  
于是就有了 **冰凌の小栈**。

如果你喜欢这个风格，欢迎 Star 或 Fork 🌟

> 💗 **特别感谢 DS酱（DeepSeek）**：从项目构思到代码实现，它像一位温暖又聪明的搭档，帮我理清逻辑、优化细节、甚至调试边缘函数。没有它，这个小栈可能还要更晚才能开门迎客。

---

<p align="center">
  <i>保持好奇，保持温柔。</i><br>
  © 2026 Ice_lyn · 冰凌呀
</p>