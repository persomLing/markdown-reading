import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppState, Settings, HistoryItem, CurrentFile, FileEntry, PageType, ThemeName, FontFamily, FileSource } from '../types'
import { BUILTIN_FILES, BUILTIN_SOURCE, isBuiltinActive } from '../builtin'
import { saveHandle, getHandle, deleteHandle, ensurePermission } from '../lib/idb'
import { buildVirtualFS, supportsNativeFS } from '../lib/virtual-fs'

const OWNER_PASSWORD = 'sy225'
const MAX_LOCAL_SOURCES = 3

// 内存缓存虚拟 handle（不能进 localStorage，页面刷新后丢失）
const virtualHandles = new Map<string, FileSystemDirectoryHandle>()

interface AppStore extends AppState {
  // 文件系统操作
  setRoot: (root: FileSystemDirectoryHandle | null) => void
  setRootName: (name: string) => void
  setDir: (dir: FileSystemDirectoryHandle | null) => void
  setPath: (path: string[]) => void
  setEntries: (entries: FileEntry[]) => void
  setCurrentFile: (file: CurrentFile | null) => void
  setCurrentPath: (path: string) => void

  // 设置操作
  setSettings: (settings: Partial<Settings>) => void
  setTheme: (theme: ThemeName) => void
  setFontFamily: (fontFamily: FontFamily) => void
  setFontSize: (size: number) => void
  setLineHeight: (height: number) => void

  // UI 状态操作
  setCurrentPage: (page: PageType) => void
  toggleToc: () => void
  setTocOpen: (open: boolean) => void
  toggleSearch: () => void
  setSearchOpen: (open: boolean) => void
  setSearchHits: (hits: any[]) => void
  setSearchIdx: (idx: number) => void

  // 历史记录操作
  setLastFile: (file: any) => void
  addHistory: (item: HistoryItem) => void
  clearHistory: () => void
  deleteHistoryItem: (path: string) => void

  // 文件系统工具方法
  loadDir: () => Promise<void>
  enterDir: (name: string) => Promise<void>
  goUp: () => Promise<void>
  navigateToPath: (newPath: string[]) => Promise<void>
  openFile: (name: string) => Promise<void>
  openFileByPath: (relPath: string) => Promise<void>

  // 文件来源操作
  verifyOwner: (password: string) => boolean
  selectLocalFolder: () => Promise<boolean>
  selectLocalFolderFromInput: (files: FileList) => Promise<boolean>
  switchSource: (id: string) => Promise<boolean>
  removeSource: (id: string) => Promise<void>
  hasNativeFS: () => boolean

  // 初始化
  init: () => Promise<void>
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // 初始状态
      root: null,
      rootName: '',
      dir: null,
      path: [],
      entries: [],
      curFile: null,
      curPath: '',
      sources: [],
      activeSourceId: null,
      isOwner: false,
      settings: {
        theme: 'bamboo',
        fontFamily: 'serif',
        fontSize: 16,
        lh: 1.85,
      },
      tocOpen: false,
      searchOpen: false,
      searchHits: [],
      searchIdx: -1,
      lastFile: null,
      history: [],
      currentPage: 'welcome',

      // 文件系统操作
      setRoot: (root) => set({ root }),
      setRootName: (rootName) => set({ rootName }),
      setDir: (dir) => set({ dir }),
      setPath: (path) => set({ path }),
      setEntries: (entries) => set({ entries }),
      setCurrentFile: (curFile) => set({ curFile }),
      setCurrentPath: (curPath) => set({ curPath }),

      // 设置操作
      setSettings: (settings) => set((state) => ({
        settings: { ...state.settings, ...settings }
      })),
      setTheme: (theme) => set((state) => ({
        settings: { ...state.settings, theme }
      })),
      setFontFamily: (fontFamily) => set((state) => ({
        settings: { ...state.settings, fontFamily }
      })),
      setFontSize: (fontSize) => set((state) => ({
        settings: { ...state.settings, fontSize }
      })),
      setLineHeight: (lh) => set((state) => ({
        settings: { ...state.settings, lh }
      })),

      // UI 状态操作
      setCurrentPage: (currentPage) => set({ currentPage }),
      toggleToc: () => set((state) => ({ tocOpen: !state.tocOpen })),
      setTocOpen: (tocOpen) => set({ tocOpen }),
      toggleSearch: () => set((state) => ({ searchOpen: !state.searchOpen })),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setSearchHits: (searchHits) => set({ searchHits }),
      setSearchIdx: (searchIdx) => set({ searchIdx }),

      // 历史记录操作
      setLastFile: (lastFile) => set({ lastFile }),
      addHistory: (item) => set((state) => ({
        history: [item, ...state.history.filter(h => h.path !== item.path)].slice(0, 50)
      })),
      clearHistory: () => set({ history: [] }),
      deleteHistoryItem: (path) => set((state) => ({
        history: state.history.filter(h => h.path !== path)
      })),

      // 文件系统工具方法
      loadDir: async () => {
        const { dir, setEntries, activeSourceId } = get()

        // 内置源：直接生成内置文件列表
        if (isBuiltinActive(activeSourceId)) {
          const builtinEntries: FileEntry[] = BUILTIN_FILES.map((f) => ({
            name: f.name,
            kind: 'file' as const,
            size: f.size,
            builtin: true,
          }))
          setEntries(builtinEntries)
          return
        }

        if (!dir) return

        const entries: FileEntry[] = []
        try {
          // 使用类型断言来处理 FileSystemDirectoryHandle 的 entries 方法
          const dirHandle = dir as any
          for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file' && /\.(md|markdown|txt)$/i.test(name)) {
              let size = 0
              try {
                const file = await handle.getFile()
                size = file.size || 0
              } catch (e) {
                console.error(`Failed to get size for ${name}:`, e)
              }
              entries.push({ name, handle, kind: 'file', size })
            } else if (handle.kind === 'directory' && !name.startsWith('.')) {
              entries.push({ name, handle, kind: 'dir' })
            }
          }
        } catch (e) {
          console.error('loadDir error:', e)
        }

        entries.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name)
        })

        setEntries(entries)
      },

      enterDir: async (name) => {
        const { activeSourceId } = get()
        // 内置源无子目录
        if (isBuiltinActive(activeSourceId)) return

        const { entries, path, setDir, setPath, loadDir } = get()
        const entry = entries.find(e => e.name === name && e.kind === 'dir')
        if (!entry || !entry.handle) return

        const newPath = [...path, name]
        setPath(newPath)
        setDir(entry.handle as FileSystemDirectoryHandle)
        await loadDir()
      },

      goUp: async () => {
        const { activeSourceId, path } = get()
        if (isBuiltinActive(activeSourceId)) return
        if (path.length === 0) return
        await get().navigateToPath(path.slice(0, -1))
      },

      // 统一的目录导航：从 root 沿 newPath 逐层解析，确保 dir 与 path 同步
      navigateToPath: async (newPath) => {
        const { activeSourceId } = get()
        if (isBuiltinActive(activeSourceId)) return

        const { root, setDir, setPath, loadDir } = get()
        if (!root) return

        setPath(newPath)

        let dir = root
        for (const p of newPath) {
          dir = await dir.getDirectoryHandle(p)
        }
        setDir(dir)
        await loadDir()
      },

      openFile: async (name) => {
        const { activeSourceId, setCurrentFile, setCurrentPath, addHistory, setLastFile, setCurrentPage } = get()

        // 内置源：从打包内容读取
        if (isBuiltinActive(activeSourceId)) {
          const f = BUILTIN_FILES.find((x) => x.name === name)
          if (!f) return
          setCurrentFile({ name, content: f.content, path: name, size: f.size })
          setCurrentPath(name)
          addHistory({
            id: Date.now().toString(),
            name,
            path: name,
            size: f.size,
            ts: Date.now(),
          })
          setLastFile({ path: name, name, ts: Date.now() })
          setCurrentPage('reader')
          return
        }

        const { entries, path } = get()
        const entry = entries.find(e => e.name === name && e.kind === 'file')
        if (!entry || !entry.handle) return

        try {
          const file = await (entry.handle as FileSystemFileHandle).getFile()
          const content = await file.text()
          const relPath = [...path, name].join('/')
          
          setCurrentFile({ name, content, path: relPath, size: file.size })
          setCurrentPath(relPath)
          
          const historyItem: HistoryItem = {
            id: Date.now().toString(),
            name,
            path: relPath,
            size: file.size,
            ts: Date.now(),
          }
          addHistory(historyItem)
          setLastFile({ path: relPath, name, ts: Date.now() })
          
          setCurrentPage('reader')
        } catch (e) {
          console.error('无法读取文件:', e)
        }
      },

      openFileByPath: async (relPath) => {
        const { activeSourceId, setCurrentFile, setCurrentPath, setCurrentPage } = get()

        // 内置源：relPath 即文件名
        if (isBuiltinActive(activeSourceId)) {
          const f = BUILTIN_FILES.find((x) => x.name === relPath)
          if (!f) return
          setCurrentFile({ name: relPath, content: f.content, path: relPath, size: f.size })
          setCurrentPath(relPath)
          setCurrentPage('reader')
          return
        }

        const { root, setDir, setPath, loadDir } = get()
        if (!root) return

        const parts = relPath.split('/')
        let dir = root

        for (let i = 0; i < parts.length - 1; i++) {
          try {
            dir = await dir.getDirectoryHandle(parts[i])
          } catch {
            console.error('文件夹不存在')
            return
          }
        }

        try {
          const fh = await dir.getFileHandle(parts[parts.length - 1])
          const file = await fh.getFile()
          const content = await file.text()
          const name = parts[parts.length - 1]

          setCurrentFile({ name, content, path: relPath, size: file.size })
          setCurrentPath(relPath)
          setPath(parts.slice(0, -1))
          setDir(dir)
          await loadDir()
          setCurrentPage('reader')
        } catch (e) {
          console.error('文件不存在或已移动:', e)
        }
      },

      // ==================== 文件来源操作 ====================
      // 验证本人身份：成功后把内置源置顶
      verifyOwner: (password) => {
        if (password !== OWNER_PASSWORD) return false
        set((state) => {
          const hasBuiltin = state.sources.some((s) => s.type === 'builtin')
          const sources = hasBuiltin
            ? state.sources
            : [BUILTIN_SOURCE, ...state.sources]
          return { isOwner: true, sources }
        })
        return true
      },

      // 选择本地文件夹（原生 API，桌面 Chromium）
      selectLocalFolder: async () => {
        if (!supportsNativeFS()) return false
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
        if (!handle) return false

        // 同名文件夹去重：已存在则直接切换，不重复添加
        const existingSource = get().sources.find((s) => s.type === 'local' && s.name === handle.name)
        if (existingSource) {
          virtualHandles.set(existingSource.id, handle as FileSystemDirectoryHandle)
          await saveHandle(existingSource.id, handle as FileSystemDirectoryHandle)
          set({
            activeSourceId: existingSource.id,
            root: handle as FileSystemDirectoryHandle,
            dir: handle as FileSystemDirectoryHandle,
            path: [],
            rootName: handle.name,
          })
          await get().loadDir()
          return true
        }

        const id = 'local-' + Date.now()
        await saveHandle(id, handle as FileSystemDirectoryHandle)
        const newSource: FileSource = { id, type: 'local', name: handle.name }

        set((state) => {
          const builtin = state.sources.filter((s) => s.type === 'builtin')
          const local = state.sources.filter((s) => s.type === 'local')
          const newLocal = [newSource, ...local].slice(0, MAX_LOCAL_SOURCES)
          const sources = [...builtin, ...newLocal]
          return {
            sources,
            activeSourceId: id,
            root: handle as FileSystemDirectoryHandle,
            dir: handle as FileSystemDirectoryHandle,
            path: [],
            rootName: handle.name,
          }
        })
        await get().loadDir()
        return true
      },

      // 选择本地文件夹（<input webkitdirectory> 降级方案，移动端）
      selectLocalFolderFromInput: async (files: FileList) => {
        if (!files || files.length === 0) return false

        const vRoot = buildVirtualFS(files)
        const folderName = vRoot.name || '下载文件夹'

        // 同名文件夹去重：已存在则直接切换，不重复添加
        const existingSource = get().sources.find((s) => s.type === 'local' && s.name === folderName)
        if (existingSource) {
          virtualHandles.set(existingSource.id, vRoot)
          set({
            activeSourceId: existingSource.id,
            root: vRoot,
            dir: vRoot,
            path: [],
            rootName: folderName,
          })
          await get().loadDir()
          return true
        }

        const id = 'local-' + Date.now()
        virtualHandles.set(id, vRoot)
        const newSource: FileSource = { id, type: 'local', name: folderName }

        set((state) => {
          const builtin = state.sources.filter((s) => s.type === 'builtin')
          const local = state.sources.filter((s) => s.type === 'local')
          const newLocal = [newSource, ...local].slice(0, MAX_LOCAL_SOURCES)
          const sources = [...builtin, ...newLocal]
          return {
            sources,
            activeSourceId: id,
            root: vRoot,
            dir: vRoot,
            path: [],
            rootName: folderName,
          }
        })
        await get().loadDir()
        return true
      },

      // 切换文件来源
      switchSource: async (id) => {
        const source = get().sources.find((s) => s.id === id)
        if (!source) return false

        if (source.type === 'builtin') {
          set({
            activeSourceId: id,
            root: null,
            dir: null,
            path: [],
            rootName: source.name,
          })
          await get().loadDir()
          return true
        }

        // 本地源：优先内存缓存（虚拟 handle），再从 IndexedDB（原生 handle）
        const cached = virtualHandles.get(id)
        if (cached) {
          set({
            activeSourceId: id,
            root: cached,
            dir: cached,
            path: [],
            rootName: source.name,
          })
          await get().loadDir()
          return true
        }

        const handle = await getHandle(id)
        if (!handle) return false
        const ok = await ensurePermission(handle, true)
        if (!ok) return false

        set({
          activeSourceId: id,
          root: handle,
          dir: handle,
          path: [],
          rootName: source.name,
        })
        await get().loadDir()
        return true
      },

      // 移除某个文件源（仅本地）
      removeSource: async (id) => {
        virtualHandles.delete(id)
        await deleteHandle(id)
        set((state) => {
          const sources = state.sources.filter((s) => s.id !== id)
          const patch: Partial<AppState> = { sources }
          if (state.activeSourceId === id) {
            patch.activeSourceId = null
            patch.entries = []
            patch.rootName = ''
          }
          return patch as any
        })
      },

      // 检测是否支持原生 File System Access API
      hasNativeFS: () => supportsNativeFS(),

      // 初始化
      init: async () => {
        // 从 localStorage 恢复状态
        const saved = localStorage.getItem('app-storage')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            if (parsed.state) {
              set(parsed.state)
            }
          } catch (e) {
            console.error('Failed to restore state:', e)
          }
        }
      },
    }),
    {
      name: 'app-storage',
      version: 3,
      partialize: (state) => ({
        settings: state.settings,
        history: state.history,
        lastFile: state.lastFile,
        sources: state.sources,
        activeSourceId: state.activeSourceId,
        isOwner: state.isOwner,
      }),
      migrate: (persisted: any, version) => {
        // v1 -> v2: 旧的 'light' 主题迁移到 'paper'，并补全 fontFamily
        if (version < 2 && persisted?.settings) {
          if (persisted.settings.theme === 'light') persisted.settings.theme = 'paper'
          if (!persisted.settings.fontFamily) persisted.settings.fontFamily = 'serif'
        }
        // v2 -> v3: 补全文件源相关字段
        if (version < 3 && persisted) {
          if (!Array.isArray(persisted.sources)) persisted.sources = []
          if (persisted.activeSourceId === undefined) persisted.activeSourceId = null
          if (persisted.isOwner === undefined) persisted.isOwner = false
        }
        return persisted
      },
    }
  )
)
