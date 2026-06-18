import React, { useRef, useEffect } from 'react'
import { useAppStore } from '../store'

const FileBrowser: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    goUp,
    navigateToPath,
    openFile,
    openFileByPath,
    selectLocalFolder,
    selectLocalFolderFromInput,
    switchSource,
    removeSource,
    hasNativeFS,
  } = useAppStore()

  const handleRefresh = async () => {
    await useAppStore.getState().loadDir()
  }

  const handleChangeFolder = async () => {
    if (hasNativeFS()) {
      try {
        const ok = await selectLocalFolder()
        if (ok) return
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
      await selectLocalFolderFromInput(files)
    } catch (err) {
      console.error('读取文件夹失败:', err)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSwitchSource = async (id: string) => {
    try {
      await switchSource(id)
    } catch (e) {
      console.error('切换来源失败:', e)
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
            {rootName}
          </div>
          <div className="files-actions">
            <button onClick={handleRefresh} title="刷新">
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
                <span className="st-name">{s.name}</span>
                {activeSourceId === s.id && s.type === 'local' && (
                  <span
                    className="st-close"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSource(s.id)
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            <button className="source-tab add" onClick={handleChangeFolder} title="添加本地文件夹">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
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

      {/* 继续阅读卡片 */}
      {lastFile && lastFile.path && (
        <div 
          className="continue-card"
          onClick={() => openFileByPath(lastFile.path)}
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
            {/* 返回上级目录 */}
            {path.length > 0 && (
              <div className="file-item" onClick={goUp}>
                <div className="fi-icon folder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </div>
                <div className="fi-info">
                  <div className="fi-name">..</div>
                </div>
              </div>
            )}
            
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
    </div>
  )
}

export default FileBrowser
