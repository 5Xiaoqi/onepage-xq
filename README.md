# 一页 · OnePage

一个装在 iPhone 主屏幕上的个人小 App：**截图记账 + 一句话拆任务 + 专注计时**。

纯静态、无账号、无后端，数据只存在本机浏览器。

## 功能

- **记账**：粘贴微信/支付宝/订单/银行短信文字，自动识别金额、商户、分类、账户、时间；也可选图 OCR 或手动。带月度预算、分类统计、重复检测、CSV 导出。
- **任务**：自然语言识别时间与任务样式（截止 / 习惯 / 项目 / 等待 / 约会 / 琐事），自动拆步骤；习惯打卡与连续天数；等待任务跟进记录；一键导出到 iPhone 日历。
- **专注**：番茄钟、时间戳计时（切后台不跑偏）、白噪音、屏幕常亮、专注统计。

## 快速开始

1. 把整个 `onepage` 文件夹部署到任意 HTTPS 静态托管（GitHub Pages / Cloudflare Pages / Netlify）。
2. iPhone 用 **Safari** 打开网址。
3. 分享 → **添加到主屏幕**。

详细步骤见 [使用说明.md](./使用说明.md)。

本地预览：双击 `本地预览.bat`（需要 Python）。

## 技术

- 原生 ES Modules + CSS，无构建步骤
- localStorage 持久化
- Service Worker 离线缓存
- Tesseract.js（CDN，按需）做图片 OCR 兜底

## 测试

```bash
node tests/core.test.mjs     # 记账/任务解析 24 项
node tests/store.test.mjs    # 数据层 6 项
node tests/ui-smoke.mjs      # 四个页面渲染 + 日历导出
node scripts/check-imports.mjs
node scripts/check-ui.mjs
```

## 已知边界

- iOS 不允许网页 App 在完全关闭时定时通知；重要提醒请「加入日历」。
- 主屏幕 App 与 Safari 标签页的本地存储互相隔离。
- 图片 OCR 精度不如 iPhone 实况文本。
- 无云同步；换机需导出/恢复 JSON 备份。

## 目录

```
index.html  manifest.webmanifest  sw.js
assets/app.css
js/  (app, store, money-parser, task-parser, view-*, ocr, ics, ui, util)
icons/
tests/  scripts/
使用说明.md  本地预览.bat
```
