# 墨 · Reader

一个优雅的 Markdown 阅读器，使用 React + TypeScript + Vite 构建。支持多主题、多字体、多文件源切换，可离线使用。

## 功能特性

- 📁 **多文件源**：内置每日精读 + 本地文件夹，最近 3 个历史源可一键切换
- � **本人引导**：「我是本人」密码验证解锁内置阅读源
- �📝 **Markdown 渲染**：支持 GFM 语法、代码高亮（highlight.js）、宽表格自适应滚动
- 🎨 **多主题**：竹青、纸质、瓷片、阳光、暗夜五套（中国传统色谱配色），每套带主题背景图
- ✍️ **多字体**：衬线、黑体、楷书、行书、可爱字体全局切换
- 📑 **目录导航**（TOC）与 **全文搜索**高亮跳转
- 📖 **阅读历史**与继续阅读
- 💾 **本地持久化**：localStorage（元数据）+ IndexedDB（文件夹句柄）
- 📱 移动端友好的响应式布局

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
