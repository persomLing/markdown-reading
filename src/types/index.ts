// 文件系统相关类型
export interface FileEntry {
  name: string
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle
  kind: 'file' | 'dir'
  size?: number
  builtin?: boolean
}

// 文件来源：内置每日精读 / 本地文件夹 / GitHub 仓库
export interface FileSource {
  id: string
  type: 'builtin' | 'local' | 'github'
  name: string
  repoUrl?: string
}

export interface CurrentFile {
  name: string
  content: string
  path: string
  size: number
}

export interface HistoryItem {
  id: string
  name: string
  path: string
  size: number
  ts: number
  sourceType?: 'builtin' | 'local' | 'github'
  sourceId?: string
}

export interface LastFile {
  path: string
  name: string
  ts?: number
  sourceType?: 'builtin' | 'local' | 'github'
  sourceId?: string
}

// 设置相关类型
export type ThemeName = 'dark' | 'bamboo' | 'paper' | 'porcelain' | 'sunlight'
export type FontFamily = 'serif' | 'sans' | 'kai' | 'xing' | 'cute'
export type TtsEngine = 'browser' | 'mimo'

export interface Settings {
  theme: ThemeName
  fontFamily: FontFamily
  fontSize: number
  lh: number
  githubToken?: string
  ttsEngine: TtsEngine
  mimoApiKey?: string
  mimoRememberApiKey: boolean
  ttsVoice: string
  ttsSpeed: number
  ttsStyle: string
  ttsAutoScroll: boolean
}

// 搜索结果类型
export interface SearchHit {
  line: number
  text: string
  start: number
  end: number
}

// TOC 项类型
export interface TocItem {
  id: string
  text: string
  level: number
  el?: HTMLElement
}

// 应用状态类型
export interface AppState {
  // 文件系统状态
  root: FileSystemDirectoryHandle | null
  rootName: string
  dir: FileSystemDirectoryHandle | null
  path: string[]
  entries: FileEntry[]
  curFile: CurrentFile | null
  curPath: string

  // 文件来源（多源切换）
  sources: FileSource[]
  activeSourceId: string | null
  isOwner: boolean

  // 设置
  settings: Settings

  // UI 状态
  tocOpen: boolean
  searchOpen: boolean
  searchHits: SearchHit[]
  searchIdx: number

  // 历史记录
  lastFile: LastFile | null
  history: HistoryItem[]

  // 页面状态
  currentPage: 'welcome' | 'files' | 'reader' | 'history' | 'settings'
}

// GitHub 仓库解析信息
export interface GitHubRepoInfo {
  owner: string
  repo: string
  branch: string
  subdir?: string
}

// GitHub 目录条目
export interface GitHubEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

// 页面类型
export type PageType = 'welcome' | 'files' | 'reader' | 'history' | 'settings'
