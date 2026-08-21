# 墨 · Reader

一个优雅的 Markdown 阅读器，使用 React + TypeScript + Vite 构建。支持多主题、多字体、多文件源切换，可离线使用。

## 功能特性

- 📁 **多文件源**：内置每日精读 + 本地文件夹，最近 3 个历史源可一键切换
- 🔐 **本人引导**：「我是本人」密码验证解锁内置阅读源
- 📝 **Markdown 渲染**：支持 GFM 语法、代码高亮（highlight.js）、宽表格自适应滚动
- 🎨 **多主题**：竹青、纸质、瓷片、阳光、暗夜五套（中国传统色谱配色），每套带主题背景图
- ✍️ **多字体**：衬线、黑体、楷书、行书、可爱字体全局切换
- 📑 **目录导航**（TOC）与 **全文搜索**高亮跳转
- 📖 **阅读历史**与继续阅读
- 💾 **本地持久化**：localStorage（元数据）+ IndexedDB（文件夹句柄）
- 📱 移动端友好的响应式布局
- 🖥️ **代码块全屏**：支持浏览器原生全屏，移动端自动锁定横屏方向
- 🔗 **锚点链接定位**：平滑滚动 + 目标标题短暂高亮反馈
- 📊 **表格滚动优化**：移动端表格水平滚动，自适应屏幕宽度
- 🔊 **语音朗读**：默认使用浏览器 Web Speech API，可选小米 MiMo-V2.5-TTS，支持音色、倍速与段落跟随

## 技术栈

- **前端框架**: React 18
- **类型系统**: TypeScript
- **构建工具**: Vite
- **状态管理**: Zustand（persist 中间件持久化）
- **样式系统**: Tailwind CSS + CSS 变量
- **Markdown 解析**: marked.js
- **代码高亮**: highlight.js

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 配置 MiMo 语音朗读

将 `.env.example` 复制为 `.env.local`，然后填入服务端密钥：

```dotenv
MIMO_API_KEY=your-new-api-key
```

`MIMO_API_KEY` 不要加 `VITE_` 前缀。它只由 Vite 开发/预览服务器的 `/api/tts` 代理读取，不会进入前端打包。应用默认使用无需密钥的 Web Speech API；选择小米语音后使用 `mimo-v2.5-tts` 和音色「冰糖」。

个人本地使用时，也可以在应用的「设置 → 语音朗读」中填写 MiMo API Key。会话 Key 会优先于服务端环境变量，并只通过 `X-MiMo-API-Key` 请求头传给同源语音代理。默认保存在 sessionStorage，关闭浏览器会话后需要重新填写；用户也可以显式选择“在此设备记住”，此时密钥会明文保存在浏览器 localStorage，仅适合私人设备。

客户端 Key 仅在本地开发模式自动接受；预览或生产部署必须显式设置 `ALLOW_CLIENT_MIMO_KEY=true`。该开关只适合私有可信部署，公开部署应继续使用服务端 `MIMO_API_KEY`，不要开启客户端 Key 转发，也不要把开发服务器直接暴露到公网。浏览器中填写的 Key 只会发送到当前站点的 `/api/tts`，不会发送给跨域或其他路径的 `VITE_TTS_ENDPOINT`。

MiMo 朗读会把当前段落发送到小米云端生成音频。请使用已轮换的新密钥，并根据实际部署环境确认费用、隐私和网络策略。

GitHub Pages 等纯静态托管无法安全保存 TTS 密钥。部署时需要一个服务端/Serverless 代理，再通过公开的 `VITE_TTS_ENDPOINT` 指向该代理；密钥仍只放在服务端密钥配置中。

### 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist` 目录。

### 预览生产版本

```bash
npm run preview
```

## 使用说明

1. 启动后选择「选择文件夹」打开本地 Markdown 文件夹，或点击「我是本人」输入密码解锁内置每日精读
2. 文件页顶部可在多个文件源之间切换，最多保留 3 个本地历史源
3. 点击文件开始阅读，右上方可打开目录、全文搜索
4. 底部导航切换历史记录与设置页
5. 设置页可切换主题、字体、字号与行距，所有设置实时预览

## 项目结构

```
markdown-reading/
├── Daily-Reading/            # 内置阅读内容（构建时打包）
├── src/
│   ├── assets/               # 主题背景图（WebP）
│   ├── components/           # React 组件
│   │   ├── WelcomePage.tsx     # 欢迎页 + 本人验证
│   │   ├── FileBrowser.tsx     # 文件浏览 + 源切换器
│   │   ├── MarkdownReader.tsx  # 阅读器 + 搜索 + 目录
│   │   ├── HistoryPage.tsx     # 历史记录
│   │   ├── SettingsPage.tsx    # 设置（主题/字体/排版）
│   │   ├── BottomNav.tsx       # 底部导航
│   │   └── Toast.tsx           # 提示组件
│   ├── lib/
│   │   └── idb.ts             # IndexedDB 工具（持久化文件夹句柄）
│   ├── store/                  # Zustand 状态管理
│   ├── types/                 # TypeScript 类型
│   ├── builtin.ts             # 内置阅读源（import.meta.glob）
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css              # 全局样式 + 主题变量
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## 数据存储说明

| 数据                                  | 位置                        | 说明                           |
| ------------------------------------- | --------------------------- | ------------------------------ |
| 设置 / 历史 / 继续阅读 / 文件源元数据 | localStorage(`app-storage`) | Zustand persist，版本化迁移    |
| 本地文件夹句柄                        | IndexedDB(`mr-handles`)     | 结构化克隆存储，实现免重选切换 |
| 内置阅读内容                          | 构建产物（bundle）          | `import.meta.glob` 打包进应用  |

## 浏览器兼容性

使用 File System Access API 访问本地文件系统，建议使用：

- Chrome 86+
- Edge 86+
- Opera 72+

内置阅读源不依赖该 API，所有浏览器可用。

## 许可证

MIT
