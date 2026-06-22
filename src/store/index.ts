import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppState, Settings, HistoryItem, CurrentFile, FileEntry, PageType, ThemeName, FontFamily, FileSource } from '../types'
import { BUILTIN_FILES, BUILTIN_SOURCE, isBuiltinActive } from '../builtin'
import { saveHandle, getHandle, deleteHandle, ensurePermission } from '../lib/idb'
import { buildVirtualFS, supportsNativeFS } from '../lib/virtual-fs'
import { parseGitHubUrl, fetchDefaultBranch, fetchRepoContents, fetchFileContent } from '../lib/github'

const OWNER_PASSWORD = 'sy225'
const MAX_SOURCES = 5

// 内存缓存虚拟 handle（不能进 localStorage，页面刷新后丢失）
const virtualHandles = new Map<string, FileSystemDirectoryHandle>()

// 从 source 中提取 GitHub 仓库信息
function getGitHubInfo(source: FileSource): { owner: string; repo: string; branch: string; subdir?: string } | null {
  if (!source.repoUrl) return null
  const parsed = parseGitHubUrl(source.repoUrl)
  if (!parsed || !parsed.branch) return null
  return { owner: parsed.owner, repo: parsed.repo, branch: parsed.branch, subdir: parsed.subdir }
}

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
  setGithubToken: (token: string) => void

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
  openFileByPath: (relPath: string, sourceId?: string, sourceType?: string) => Promise<boolean>

  // 文件来源操作
  verifyOwner: (password: string) => boolean
  selectLocalFolder: () => Promise<boolean>
  selectLocalFolderFromInput: (files: FileList) => Promise<boolean>
  addGitHubSource: (url: string) => Promise<{ ok: boolean; error?: string }>
  switchSource: (id: string) => Promise<boolean>
  removeSource: (id: string) => Promise<void>
  hasNativeFS: () => boolean

  // 加载状态
  loading: boolean
  setLoading: (loading: boolean) => void

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
      loading: false,

      // 加载状态
      setLoading: (loading) => set({ loading }),

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
      setGithubToken: (token) => set((state) => ({
        settings: { ...state.settings, githubToken: token || undefined }
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
        const { dir, setEntries, activeSourceId, sources, path, settings } = get()

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

        // GitHub 源：调用 API 获取目录内容
        const source = sources.find(s => s.id === activeSourceId)
        if (source?.type === 'github') {
          const info = getGitHubInfo(source)
          if (!info) { setEntries([]); return }
          try {
            const apiPath = path.join('/')
            const ghEntries = await fetchRepoContents(info.owner, info.repo, apiPath, info.branch, settings.githubToken)
            const entries: FileEntry[] = ghEntries.map(e => ({
              name: e.name,
              kind: e.type === 'dir' ? 'dir' : 'file',
              size: e.size,
            }))
            setEntries(entries)
          } catch (e) {
            console.error('GitHub loadDir error:', e)
            setEntries([])
          }
          return
        }

        // 本地源：遍历目录
        if (!dir) return

        const entries: FileEntry[] = []
        try {
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
        const { activeSourceId, sources } = get()
        if (isBuiltinActive(activeSourceId)) return

        // GitHub 源：仅更新 path，重新加载
        const source = sources.find(s => s.id === activeSourceId)
        if (source?.type === 'github') {
          const { path, setPath } = get()
          setPath([...path, name])
          await get().loadDir()
          return
        }

        // 本地源：切换 dir handle
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

      navigateToPath: async (newPath) => {
        const { activeSourceId, sources } = get()
        if (isBuiltinActive(activeSourceId)) return

        // GitHub 源：仅更新 path，重新加载
        const source = sources.find(s => s.id === activeSourceId)
        if (source?.type === 'github') {
          get().setPath(newPath)
          await get().loadDir()
          return
        }

        // 本地源：从 root 逐层解析
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
        const { activeSourceId, sources, setCurrentFile, setCurrentPath, addHistory, setLastFile, setCurrentPage, setLoading } = get()
        setLoading(true)

        try {
          const source = sources.find(s => s.id === activeSourceId)
          const sourceId = activeSourceId ?? undefined

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
              sourceType: 'builtin',
              sourceId,
            })
            setLastFile({ path: name, name, ts: Date.now(), sourceType: 'builtin', sourceId })
            setCurrentPage('reader')
            return
          }

          // GitHub 源：通过 API 获取文件内容
          if (source?.type === 'github') {
            const info = getGitHubInfo(source)
            if (!info) return
            const { path } = get()
            const fullPath = [...path, name].join('/')
            const content = await fetchFileContent(info.owner, info.repo, fullPath, info.branch)
            const size = new Blob([content]).size
            setCurrentFile({ name, content, path: fullPath, size })
            setCurrentPath(fullPath)
            addHistory({
              id: Date.now().toString(),
              name,
              path: fullPath,
              size,
              ts: Date.now(),
              sourceType: 'github',
              sourceId,
            })
            setLastFile({ path: fullPath, name, ts: Date.now(), sourceType: 'github', sourceId })
            setCurrentPage('reader')
            return
          }

          // 本地源：从 handle 读取
          const { entries, path } = get()
          const entry = entries.find(e => e.name === name && e.kind === 'file')
          if (!entry || !entry.handle) return

          const file = await (entry.handle as FileSystemFileHandle).getFile()
          const content = await file.text()
          const relPath = [...path, name].join('/')

          setCurrentFile({ name, content, path: relPath, size: file.size })
          setCurrentPath(relPath)

          addHistory({
            id: Date.now().toString(),
            name,
            path: relPath,
            size: file.size,
            ts: Date.now(),
            sourceType: 'local',
            sourceId,
          })
          setLastFile({ path: relPath, name, ts: Date.now(), sourceType: 'local', sourceId })

          setCurrentPage('reader')
        } catch (e) {
          console.error('读取文件失败:', e)
        } finally {
          setLoading(false)
        }
      },

      openFileByPath: async (relPath, sourceId, _sourceType) => {
        const { sources, setLoading } = get()
        setLoading(true)

        try {
          // 如果指定了 sourceId，先切换到对应 source
          if (sourceId && sourceId !== get().activeSourceId) {
            // 检查 source 是否还存在
            const targetSource = sources.find(s => s.id === sourceId)
            if (!targetSource) { setLoading(false); return false }

            // 内置源
            if (targetSource.type === 'builtin') {
              await get().switchSource(sourceId)
            } else if (targetSource.type === 'github') {
              // GitHub 源
              const info = getGitHubInfo(targetSource)
              if (!info) { setLoading(false); return false }
              const subdir = info.subdir
              const initialPath = subdir ? subdir.split('/') : []
              set({
                activeSourceId: sourceId,
                root: null,
                dir: null,
                path: initialPath,
                rootName: targetSource.name,
              })
              await get().loadDir()
            } else {
              // 本地源：切换并加载
              await get().switchSource(sourceId)
            }
          }

          const { activeSourceId, setCurrentFile, setCurrentPath, setCurrentPage } = get()
          const source = sources.find(s => s.id === (sourceId || activeSourceId))

          // 内置源
          if (isBuiltinActive(sourceId || activeSourceId)) {
            const f = BUILTIN_FILES.find((x) => x.name === relPath)
            if (!f) return false
            setCurrentFile({ name: relPath, content: f.content, path: relPath, size: f.size })
            setCurrentPath(relPath)
            setCurrentPage('reader')
            return true
          }

          // GitHub 源
          if (source?.type === 'github') {
            const info = getGitHubInfo(source)
            if (!info) return false
            const content = await fetchFileContent(info.owner, info.repo, relPath, info.branch)
            const name = relPath.split('/').pop() || relPath
            const size = new Blob([content]).size
            setCurrentFile({ name, content, path: relPath, size })
            setCurrentPath(relPath)
            // 恢复 path 到文件所在目录
            const pathParts = relPath.split('/').slice(0, -1)
            const subdir = info.subdir ? info.subdir.split('/') : []
            // 去掉 subdir 前缀，只保留 path 中的部分
            const relPathWithoutSubdir = pathParts.slice(subdir.length)
            get().setPath(relPathWithoutSubdir)
            await get().loadDir()
            setCurrentPage('reader')
            return true
          }

          // 本地源
          const { root, setDir, setPath, loadDir } = get()
          if (!root) return false

          const parts = relPath.split('/')
          let dir = root

          for (let i = 0; i < parts.length - 1; i++) {
            try {
              dir = await dir.getDirectoryHandle(parts[i])
            } catch {
              console.error('文件夹不存在')
              return false
            }
          }

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
          return true
        } catch (e) {
          console.error('文件打开失败:', e)
          return false
        } finally {
          setLoading(false)
        }
      },

      // ==================== 文件来源操作 ====================
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

      selectLocalFolder: async () => {
        if (!supportsNativeFS()) return false
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
        if (!handle) return false

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

        // 检查来源总数（不含内置）
        const nonBuiltinCount = get().sources.filter(s => s.type !== 'builtin').length
        if (nonBuiltinCount >= MAX_SOURCES) return false

        const id = 'local-' + Date.now()
        await saveHandle(id, handle as FileSystemDirectoryHandle)
        const newSource: FileSource = { id, type: 'local', name: handle.name }

        set((state) => {
          const builtin = state.sources.filter((s) => s.type === 'builtin')
          const nonBuiltin = state.sources.filter((s) => s.type !== 'builtin')
          const newNonBuiltin = [newSource, ...nonBuiltin].slice(0, MAX_SOURCES)
          return {
            sources: [...builtin, ...newNonBuiltin],
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

      selectLocalFolderFromInput: async (files: FileList) => {
        if (!files || files.length === 0) return false

        const vRoot = buildVirtualFS(files)
        const folderName = vRoot.name || '下载文件夹'

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

        const nonBuiltinCount = get().sources.filter(s => s.type !== 'builtin').length
        if (nonBuiltinCount >= MAX_SOURCES) return false

        const id = 'local-' + Date.now()
        virtualHandles.set(id, vRoot)
        const newSource: FileSource = { id, type: 'local', name: folderName }

        set((state) => {
          const builtin = state.sources.filter((s) => s.type === 'builtin')
          const nonBuiltin = state.sources.filter((s) => s.type !== 'builtin')
          const newNonBuiltin = [newSource, ...nonBuiltin].slice(0, MAX_SOURCES)
          return {
            sources: [...builtin, ...newNonBuiltin],
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

      addGitHubSource: async (url) => {
        const { settings, setLoading } = get()
        setLoading(true)
        try {
          const parsed = parseGitHubUrl(url)
          if (!parsed) return { ok: false, error: '无法解析 GitHub 地址，请检查格式' }

          // 检查来源总数
          const nonBuiltinCount = get().sources.filter(s => s.type !== 'builtin').length
          if (nonBuiltinCount >= MAX_SOURCES) {
            return { ok: false, error: `来源数量已达上限（${MAX_SOURCES} 个），请先删除其他来源` }
          }

          // 获取分支（URL 中未指定时调用 API）
          let branch = parsed.branch
          if (!branch) {
            try {
              branch = await fetchDefaultBranch(parsed.owner, parsed.repo, settings.githubToken)
            } catch (e) {
              return { ok: false, error: (e as Error).message }
            }
          }

          const repoName = `${parsed.owner}/${parsed.repo}`
          const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}/tree/${branch}`

          // 同名仓库去重
          const existingSource = get().sources.find(s => s.type === 'github' && s.name === repoName)
          if (existingSource) {
            // 已存在则直接切换
            const subdir = parsed.subdir
            const initialPath = subdir ? subdir.split('/') : []
            set({
              activeSourceId: existingSource.id,
              root: null,
              dir: null,
              path: initialPath,
              rootName: repoName,
            })
            // 更新 repoUrl（可能分支变了）
            existingSource.repoUrl = normalizedUrl
            await get().loadDir()
            return { ok: true }
          }

          const id = 'github-' + Date.now()
          const newSource: FileSource = { id, type: 'github', name: repoName, repoUrl: normalizedUrl }

          const subdir = parsed.subdir
          const initialPath = subdir ? subdir.split('/') : []

          set((state) => {
            const builtin = state.sources.filter((s) => s.type === 'builtin')
            const nonBuiltin = state.sources.filter((s) => s.type !== 'builtin')
            const newNonBuiltin = [newSource, ...nonBuiltin].slice(0, MAX_SOURCES)
            return {
              sources: [...builtin, ...newNonBuiltin],
              activeSourceId: id,
              root: null,
              dir: null,
              path: initialPath,
              rootName: repoName,
            }
          })
          await get().loadDir()
          return { ok: true }
        } finally {
          setLoading(false)
        }
      },

      switchSource: async (id) => {
        const { setLoading } = get()
        setLoading(true)
        try {
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

          // GitHub 源：解析 URL 获取初始路径
          if (source.type === 'github') {
            const info = getGitHubInfo(source)
            if (!info) return false
            const subdir = info.subdir
            const initialPath = subdir ? subdir.split('/') : []
            set({
              activeSourceId: id,
              root: null,
              dir: null,
              path: initialPath,
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
          if (!handle) {
            // 文件源找不到，自动删除
            await get().removeSource(id)
            return false
          }
          const ok = await ensurePermission(handle, true)
          if (!ok) {
            // 权限验证失败，自动删除
            await get().removeSource(id)
            return false
          }

          set({
            activeSourceId: id,
            root: handle,
            dir: handle,
            path: [],
            rootName: source.name,
          })
          await get().loadDir()
          return true
        } finally {
          setLoading(false)
        }
      },

      removeSource: async (id) => {
        const source = get().sources.find(s => s.id === id)
        if (!source) return
        // 禁止删除内置每日精读
        if (source.type === 'builtin') return

        // 本地源清理 handle 缓存
        if (source.type === 'local') {
          virtualHandles.delete(id)
          await deleteHandle(id)
        }

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

      hasNativeFS: () => supportsNativeFS(),

      init: async () => {
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
      version: 5,
      partialize: (state) => ({
        settings: state.settings,
        history: state.history,
        lastFile: state.lastFile,
        sources: state.sources,
        activeSourceId: state.activeSourceId,
        isOwner: state.isOwner,
        rootName: state.rootName,
        currentPage: state.currentPage,
        path: state.path,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          // 水合完成后，如果有活跃来源但没有加载目录，自动加载
          if (state && state.activeSourceId) {
            const store = useAppStore.getState()
            if (store.entries.length === 0) {
              const source = state.sources?.find((s: FileSource) => s.id === state.activeSourceId)
              // 本地源：先从 IndexedDB 恢复句柄
              if (source?.type === 'local') {
                getHandle(state.activeSourceId).then((handle) => {
                  if (handle) {
                    store.setRoot(handle)
                    store.setDir(handle)
                    store.loadDir()
                  }
                })
              } else {
                // 内置/GitHub 源：直接加载
                store.loadDir()
              }
            }
          }
        }
      },
      migrate: (persisted: any, version) => {
        if (version < 2 && persisted?.settings) {
          if (persisted.settings.theme === 'light') persisted.settings.theme = 'paper'
          if (!persisted.settings.fontFamily) persisted.settings.fontFamily = 'serif'
        }
        if (version < 3 && persisted) {
          if (!Array.isArray(persisted.sources)) persisted.sources = []
          if (persisted.activeSourceId === undefined) persisted.activeSourceId = null
          if (persisted.isOwner === undefined) persisted.isOwner = false
        }
        // v3 -> v4: 无需特殊迁移，新增字段均为可选
        // v4 -> v5: 新增 rootName 持久化
        return persisted
      },
    }
  )
)
