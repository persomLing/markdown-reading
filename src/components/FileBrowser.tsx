import React, { useRef, useEffect, useState } from 'react'
import { useAppStore, MAX_SOURCES } from '../store'
import { showToast } from './Toast'
import { getHandle, restoreVirtualFS } from '../lib/idb'

const FileBrowser: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initRef = useRef(false)
  const [showGithub, setShowGithub] = useState(false)
  const [githubUrl, setGithubUrl] = useState('')
  const [githubBusy, setGithubBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [pendingRetry, setPendingRetry] = useState<'native' | 'input' | null>(null)
  const [invalidModal, setInvalidModal] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  useEffect(() => {
    const el = fileInputRef.current
    if (el) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
    }
  }, [])

  const {
    rootName,
    path,
    entries,
    lastFile,
    sources,
    activeSourceId,
    enterDir,
    navigateToPath,
    openFile,
    openFileByPath,
    selectLocalFolder,
    selectLocalFolderFromInput,
    switchSource,
    removeSource,
    addGitHubSource,
    hasNativeFS,
    setCurrentPage,
  } = useAppStore()

  // 当 FileBrowser 重新挂载时，检查文件源有效性并加载
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    
    const checkSources = async () => {
      const store = useAppStore.getState()
      if (!store.activeSourceId && store.sources.length > 0) {
        const nextSource = store.sources.find(s => s.type !== 'builtin') || store.sources[0]
        await store.switchSource(nextSource.id)
        return
      }

      const activeSource = store.sources.find(s => s.id === store.activeSourceId)
      const localSources = activeSource?.type === 'local' ? [activeSource] : []
      const invalidSources: { id: string; name: string }[] = []
      const permissionFailedSources: string[] = []
      
      // 检查所有本地文件源
      for (const source of localSources) {
        // 优先检查内存缓存（降级方案添加的源只存在于 virtualHandles）
        if (store.hasVirtualHandle(source.id)) {
          continue
        }
        
        // 再检查 IndexedDB（原生API添加的源）
        const vfsData = await Promise.race([
          restoreVirtualFS(source.id),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
        ])
        if (vfsData) {
          continue
        }

        const handle = await Promise.race([
          getHandle(source.id),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
        ])
        if (!handle) {
          // 内存和 IndexedDB 都没有，收集待删除
          invalidSources.push({ id: source.id, name: source.name })
        }
      }
      
      // 弹窗提示失效源，确认后自动删除
      if (invalidSources.length > 0) {
        const names = invalidSources.map(s => s.name).join('、')
        setInvalidModal({
          title: '文件源已失效',
          message: `以下文件源因数据丢失已失效，将被自动移除：
${names}

请重新选择文件夹以继续使用。`,
          onConfirm: async () => {
            for (const s of invalidSources) {
              await store.removeSource(s.id)
            }
            setInvalidModal(null)
            showToast('已移除失效文件源，请重新选择文件夹', 'info')
          },
        })
      }
      
      // 提示权限失败的源
      if (permissionFailedSources.length > 0) {
        showToast(`以下文件源权限已过期，请重新选择：${permissionFailedSources.join('、')}`, 'info')
      }
      
      // 加载目录
      if (store.activeSourceId && store.entries.length === 0) {
        if (activeSource?.type === 'local') {
          await store.switchSource(store.activeSourceId)
        } else {
          await store.loadDir()
        }
      }
    }
    
    checkSources()
  }, [activeSourceId, entries.length])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await useAppStore.getState().loadDir()
    } finally {
      setRefreshing(false)
    }
  }

  const handleChangeFolder = async () => {
    if (hasNativeFS()) {
      try {
        const result = await selectLocalFolder()
        if (result === true) return
        if (result === 'limit_reached') {
          setPendingRetry('native')
          setShowLimitModal(true)
          return
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.warn('原生文件夹选择不可用，降级到 input:', e)
        } else {
          return
        }
      }
    }
    // 降级：触发隐藏的 input
    fileInputRef.current?.click()
  }

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const result = await selectLocalFolderFromInput(files)
      if (result === 'limit_reached') {
        setPendingRetry('input')
        setShowLimitModal(true)
        showToast('文件源数量已达上限，请先删除一个旧源', 'info')
      }
    } catch (err) {
      console.error('读取文件夹失败:', err)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSwitchSource = async (id: string) => {
    try {
      const result = await switchSource(id)
      if (result === 'success') return

      const source = sources.find(s => s.id === id)
      if (!source) return

      if (result === 'permission_denied') {
        // 权限被拒绝：不自动删除，提示用户重新授权
        showToast(`文件源「${source.name}」权限已过期，请点击重新选择文件夹`, 'info')
      } else {
        // 源找不到：弹窗提示后自动删除
        setInvalidModal({
          title: '文件源已失效',
          message: `文件源「${source.name}」因数据丢失已失效，将被自动移除。

请重新选择文件夹以继续使用。`,
          onConfirm: async () => {
            await removeSource(id)
            setInvalidModal(null)
            showToast(`已移除失效文件源「${source.name}」`, 'info')
          },
        })
      }
    } catch (e) {
      console.error('切换来源失败:', e)
      showToast('切换来源失败，请重试', 'error')
    }
  }

  // GitHub 仓库提交
  const handleRemoveSource = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setInvalidModal(null)
    await removeSource(id)
  }

  const handleGithubSubmit = async () => {
    const url = githubUrl.trim()
    if (!url) {
      showToast('请输入 GitHub 仓库地址', 'error')
      return
    }
    setGithubBusy(true)
    try {
      const result = await addGitHubSource(url)
      if (result.ok) {
        setShowGithub(false)
      } else {
        showToast(result.error || '添加失败', 'error')
      }
    } catch (e) {
      showToast('网络错误，请重试', 'error')
    } finally {
      setGithubBusy(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (ts: number) => {
    const date = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
    
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="file-browser">
      {/* 头部 */}
      <div className="files-header">
        <div className="files-top">
          <div className="folder-name">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>{rootName}</span>
          </div>
          <div className="files-actions">
            <button onClick={() => setCurrentPage('welcome')} title="返回封面">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
            <button onClick={handleRefresh} title="刷新" className={refreshing ? 'refreshing' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <button onClick={handleChangeFolder} title="切换文件夹">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button onClick={() => { setShowGithub(true); setGithubUrl('') }} title="添加 GitHub 仓库">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </button>
          </div>
        </div>

        {/* 文件来源切换器 */}
        {sources.length > 0 && (
          <div className="source-tabs">
            {sources.map((s) => (
              <button
                key={s.id}
                className={`source-tab ${activeSourceId === s.id ? 'active' : ''} ${s.type === 'builtin' ? 'is-builtin' : ''}`}
                onClick={() => handleSwitchSource(s.id)}
                title={s.type === 'builtin' ? '内置每日精读' : s.name}
              >
                {s.type === 'builtin' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                )}
                {s.type === 'github' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                )}
                <span className="st-name">{s.name}</span>
                {(s.type === 'local' || s.type === 'github') && (
                  <span
                    className="st-close"
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleRemoveSource(e, s.id)}
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        
        {/* 面包屑导航 */}
        <div className="breadcrumb">
          <span className="bc-item" onClick={() => navigateToPath([])}>
            {rootName}
          </span>
          {path.map((p, i) => (
            <React.Fragment key={i}>
              <span className="bc-sep">›</span>
              <span 
                className="bc-item"
                onClick={() => navigateToPath(path.slice(0, i + 1))}
              >
                {p}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 继续阅读卡片：仅当来源仍存在时展示 */}
      {lastFile && lastFile.path && (!lastFile.sourceId || sources.some(s => s.id === lastFile.sourceId)) && (
        <div 
          className="continue-card"
          onClick={() => openFileByPath(lastFile.path, lastFile.sourceId, lastFile.sourceType)}
        >
          <div className="cc-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div className="cc-info">
            <div className="cc-label">继续阅读</div>
            <div className="cc-name">{lastFile.name}</div>
            <div className="cc-time">
              {lastFile.ts ? formatDate(lastFile.ts) : ''}
            </div>
          </div>
        </div>
      )}

      {/* 文件列表 */}
      <div className="file-list">
        {entries.length === 0 ? (
          <div className="files-empty">
            <div className="empty-illu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="empty-title">空空如也</p>
            <span className="empty-sub">此文件夹中暂无 Markdown 文件</span>
          </div>
        ) : (
          <>
            {/* 文件和文件夹列表 */}
            {entries.map((entry, i) => (
              <div 
                key={i}
                className="file-item"
                onClick={() => {
                  if (entry.kind === 'dir') {
                    enterDir(entry.name)
                  } else {
                    openFile(entry.name)
                  }
                }}
              >
                <div className={`fi-icon ${entry.kind}`}>
                  {entry.kind === 'dir' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  )}
                </div>
                <div className="fi-info">
                  <div className="fi-name">{entry.name}</div>
                  {entry.kind === 'file' && (
                    <div className="fi-meta">{formatSize(entry.size || 0)}</div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 移动端降级：隐藏的 file input（不能用 display:none，iOS Safari 上 click() 会失效） */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', top: 0, left: 0 }}
        onChange={handleInputChange}
        accept=".md,.markdown,.txt,text/markdown,text/plain"
      />

      {/* 失效文件源弹窗 */}
      {invalidModal && (
        <div className="pwd-overlay" onClick={() => setInvalidModal(null)}>
          <div className="pwd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwd-head">
              <div className="pwd-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3>{invalidModal.title}</h3>
            </div>
            <p className="pwd-desc" style={{ whiteSpace: 'pre-line' }}>{invalidModal.message}</p>
            <div className="pwd-actions">
              <button className="pwd-confirm" onClick={invalidModal.onConfirm}>
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 源数量上限弹窗 */}
      {showLimitModal && (
        <div className="pwd-overlay" onClick={() => { setShowLimitModal(false); setPendingRetry(null) }}>
          <div className="pwd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwd-head">
              <div className="pwd-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3>文件源数量已达上限</h3>
            </div>
            <p className="pwd-desc">最多可添加 {MAX_SOURCES} 个文件源（不含每日精读），请选择一个要删除的源：</p>
            <div className="source-limit-list">
              {sources.filter(s => s.type !== 'builtin').map(s => (
                <div key={s.id} className="source-limit-item">
                  <span className="source-limit-name">
                    {s.type === 'github' && '🔗 '}
                    {s.type === 'local' && '📁 '}
                    {s.name}
                  </span>
                  <button
                    className="source-limit-del"
                    onClick={async () => {
                      await removeSource(s.id)
                      setShowLimitModal(false)
                      // 自动重试添加
                      if (pendingRetry === 'native') {
                        setPendingRetry(null)
                        setTimeout(() => handleChangeFolder(), 100)
                      } else if (pendingRetry === 'input') {
                        setPendingRetry(null)
                        setTimeout(() => fileInputRef.current?.click(), 100)
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
            <div className="pwd-actions">
              <button className="pwd-cancel" onClick={() => { setShowLimitModal(false); setPendingRetry(null) }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub 仓库输入弹窗 */}
      {showGithub && (
        <div className="pwd-overlay" onClick={() => !githubBusy && setShowGithub(false)}>
          <div className="pwd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwd-head">
              <div className="pwd-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
              </div>
              <h3>GitHub 仓库</h3>
            </div>
            <p className="pwd-desc">输入公共仓库地址，浏览其中的 Markdown 文件</p>
            <input
              type="url"
              className="pwd-input"
              value={githubUrl}
              autoFocus
              disabled={githubBusy}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !githubBusy) handleGithubSubmit()
                if (e.key === 'Escape' && !githubBusy) setShowGithub(false)
              }}
              placeholder="https://github.com/owner/repo"
            />
            {githubBusy && (
              <div className="github-loading">
                <div className="github-loading-spinner" />
                <p className="github-loading-text">正在从 GitHub 获取仓库内容...</p>
                <p className="github-loading-hint">首次加载可能需要几秒钟</p>
              </div>
            )}
            <div className="pwd-actions">
              <button className="pwd-cancel" onClick={() => setShowGithub(false)} disabled={githubBusy}>
                取消
              </button>
              <button className="pwd-confirm" onClick={handleGithubSubmit} disabled={githubBusy}>
                {githubBusy ? '加载中...' : '打开'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileBrowser
