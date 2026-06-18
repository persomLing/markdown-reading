import React, { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store'

const WelcomePage: React.FC = () => {
  const [showPwd, setShowPwd] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwdError, setPwdError] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { verifyOwner, selectLocalFolder, selectLocalFolderFromInput, switchSource, setCurrentPage, hasNativeFS, isOwner } = useAppStore()

  // 在 DOM 上设置 webkitdirectory（React 不识别该非标准属性）
  useEffect(() => {
    const el = fileInputRef.current
    if (el) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
    }
  }, [])

  // 选择本地文件夹（自动检测原生/降级）
  const handleSelectFolder = async () => {
    if (hasNativeFS()) {
      setBusy(true)
      try {
        const ok = await selectLocalFolder()
        if (ok) {
          setCurrentPage('files')
          return
        }
      } catch (e) {
        // 原生 API 调用失败（安卓/iOS 上 API 存在但不可用），降级到 input
        if ((e as Error).name !== 'AbortError') {
          console.warn('原生文件夹选择不可用，降级到 input:', e)
        } else {
          // 用户取消，不降级
          return
        }
      } finally {
        setBusy(false)
      }
    }
    // 降级：触发隐藏的 input
    fileInputRef.current?.click()
  }

  // 移动端 input change 回调
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const ok = await selectLocalFolderFromInput(files)
      if (ok) setCurrentPage('files')
    } catch (err) {
      console.error('读取文件夹失败:', err)
    } finally {
      setBusy(false)
      // 清空 input 以便重复选择同一文件夹
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 我是本人 / 进入每日精读
  const handleOwnerClick = () => {
    if (isOwner) {
      // 已验证过，直接进入
      setBusy(true)
      switchSource('builtin-daily-reading').then(() => {
        setCurrentPage('files')
        setBusy(false)
      })
      return
    }
    setPwd('')
    setPwdError(false)
    setShowPwd(true)
  }

  // 提交密码验证
  const handlePwdSubmit = () => {
    const ok = verifyOwner(pwd)
    if (!ok) {
      setPwdError(true)
      return
    }
    setShowPwd(false)
    setBusy(true)
    switchSource('builtin-daily-reading').then(() => {
      setCurrentPage('files')
      setBusy(false)
    })
  }

  return (
    <div className="welcome-page">
      <div className="welcome-wrap">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h1>墨 · Reader</h1>
        <p className="subtitle">优雅的 Markdown 阅读器</p>
        <div className="divider" />

        <div className="welcome-actions">
          <button className="btn-primary" onClick={handleSelectFolder} disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            选择文件夹
          </button>

          <button className="btn-owner" onClick={handleOwnerClick} disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isOwner ? (
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              ) : (
                <>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </>
              )}
            </svg>
            {isOwner ? '每日精读' : '我是本人'}
          </button>
        </div>

        <p className="hint">支持 .md, .markdown, .txt 文件</p>
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

      {/* 密码验证弹窗 */}
      {showPwd && (
        <div className="pwd-overlay" onClick={() => setShowPwd(false)}>
          <div className="pwd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwd-head">
              <div className="pwd-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>本人验证</h3>
            </div>
            <p className="pwd-desc">请输入密码以解锁每日精读</p>
            <input
              type="password"
              className={`pwd-input ${pwdError ? 'error' : ''}`}
              value={pwd}
              autoFocus
              onChange={(e) => {
                setPwd(e.target.value)
                setPwdError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePwdSubmit()
                if (e.key === 'Escape') setShowPwd(false)
              }}
              placeholder="请输入密码"
            />
            {pwdError && <span className="pwd-err">密码不正确，请重试</span>}
            <div className="pwd-actions">
              <button className="pwd-cancel" onClick={() => setShowPwd(false)}>
                取消
              </button>
              <button className="pwd-confirm" onClick={handlePwdSubmit}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WelcomePage
