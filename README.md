# Evergreen Note

本地优先的层级 Markdown 笔记应用：Electron + React 前端、零依赖 Node 后端（`node:sqlite`）、数据落 SQLite。

本项目基于已停止维护的开源笔记应用 [Notekit](https://github.com/blackhole89/notekit)（GTK3 桌面版）的 Web 端代码重建：从其编译产物的 source map 无损还原出 TypeScript/React 源码，重建了 Vite 构建工程，并自研了后端与 Electron 外壳，使其重新成为可构建、可长期自行维护、可二次开发的完整应用。

## 功能特性

- **层级笔记**：无限层级节点、块级双链（Bilink）、反向链接、块引用
- **富内容**：LaTeX 公式、Mermaid 图表、代码块、表格、图片与 PDF 附件
- **知识管理**：标签、主题、关键词、全文搜索、关系图谱、热力图
- **效率工具**：日记、间隔重复（SRS）、番茄钟、快照历史（Revision）、夜间模式
- **AI 助手**：OpenAI 兼容接口（API Key 由用户自行配置）
- **本地优先**：所有数据存于本地 SQLite 文件，不依赖任何云服务

## 架构

```
notekit-src/
├── src/        React 前端（TypeScript，自 source map 还原）
├── server/     零依赖 Node 后端（HTTP API + node:sqlite）
├── desktop/    Electron 外壳（以 ELECTRON_RUN_AS_NODE 拉起后端）
├── public/     内置静态资源（CodeMirror、AntV G6 等）
└── tools/      开发辅助脚本
```

前端 ↔ 后端 ↔ SQLite 的完整数据流已端到端验证；构建产物与原版体量相当（约 2.8 MB）。

## 下载安装（macOS）

到 [Releases](https://github.com/ttmouse/evergreen-note/releases) 下载最新的 `.dmg`，打开后把
**Evergreen note** 拖进「应用程序」即可。压缩包里有一份《安装说明.txt》，写清了首次打开、
数据位置、备份与卸载。

- 仅支持 **Apple Silicon**（M 系列）Mac。
- 安装包**没有 Apple 开发者签名**，第一次打开要「右键 → 打开 → 再点打开」；
  若系统仍拒绝，执行 `xattr -dr com.apple.quarantine "/Applications/Evergreen note.app"`。
- 笔记全部存在本机 `~/Library/Application Support/Evergreen note/library/`，不联网、不上传。

自己打包（开发者）：`cd notekit-src && node tools/build-dmg.mjs`，产物在
`notekit-src/artifacts/release/`。

## 从源码运行

要求：Node 22+（需要内置 `node:sqlite`）、pnpm

```bash
cd notekit-src
pnpm install

# 浏览器模式：构建前端 + 启动本地服务
pnpm build
pnpm serve               # http://127.0.0.1:11814

# Electron 桌面应用
pnpm desktop

# 前端开发模式（Vite）
pnpm dev

# 存储层测试
pnpm test:storage
```

数据目录与端口可在 `notekit-src/package.json` 中通过 `profileName` / `defaultPort` 调整。首次启动使用空库，不会读取任何已有数据。

> **Electron 安装提示**：桌面模式依赖 Electron 二进制（约 100MB）。若下载缓慢或失败，可用镜像：
>
> ```bash
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
> ```
>
> 若安装后 `pnpm desktop` 报 "Electron failed to install correctly"，手动补跑一次下载即可：
>
> ```bash
> node node_modules/electron/install.js
> ```

打包 macOS `.app` 可使用仓库根目录的 `tools/build-desktop-app.py`。

## 源码还原说明

原版 Web 产物带有完整 source map，本项目借此无损还原出 553 个 TS/TSX 源文件；随后按 React 18 基线重建 `package.json` / `vite.config.ts` / `tsconfig.json`，补齐语言包与样式，直至构建通过、界面可交互、数据可落库。还原过程中处理了 `?raw` 资源导入与 slate 产物循环引用等问题。

## 许可证

- 本项目为 Notekit 的衍生作品，继承其 [GPL-3.0](LICENSE) 许可证开源
- 原版项目：<https://github.com/blackhole89/notekit> ，感谢原作者 blackhole89 的工作
- `notekit-src/public/assets/` 下内置的第三方库（CodeMirror、AntV G6 等）遵循其各自的开源许可证
