import React, { useEffect, useRef } from 'react'
import { useAppStore } from './store'
import WelcomePage from './components/WelcomePage'
import FileBrowser from './components/FileBrowser'
import MarkdownReader from './components/MarkdownReader'
import HistoryPage from './components/HistoryPage'
import SettingsPage from './components/SettingsPage'
import BottomNav from './components/BottomNav'
import Toast from './components/Toast'

const App: React.FC = () => {
  const { currentPage, settings, lastFile, loading } = useAppStore()
  const restoreRef = useRef(false)

  useEffect(() => {
    // 应用主题与字体
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.documentElement.setAttribute('data-font', settings.fontFamily)
  }, [settings.theme, settings.fontFamily])

  // 自动恢复上次阅读的文件
  useEffect(() => {
    if (restoreRef.current) return
    restoreRef.current = true

    const restoreLastFile = async () => {
      if (!lastFile || !lastFile.path) return

      const { openFileByPath } = useAppStore.getState()

      // 优先尝试通过 sourceId 恢复
      if (lastFile.sourceId && lastFile.sourceType) {
        const ok = await openFileByPath(lastFile.path, lastFile.sourceId, lastFile.sourceType)
        if (ok) return
      }

      // 无 sourceId 或恢复失败时，尝试直接打开（兼容旧数据）
      const ok = await openFileByPath(lastFile.path)
      if (ok) return

      // 恢复失败，清除 lastFile
      useAppStore.getState().setLastFile(null)
    }

    restoreLastFile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const renderPage = () => {
    switch (currentPage) {
      case 'welcome':
        return <WelcomePage />
      case 'files':
        return <FileBrowser />
      case 'reader':
        return <MarkdownReader />
      case 'history':
        return <HistoryPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <WelcomePage />
    }
  }

  return (
    <div className="app">
      {renderPage()}
      <BottomNav />
      <Toast />
      {/* 全局加载遮罩 */}
      {loading && (
        <div className="global-loading-overlay">
          <div className="global-loading-box">
            <div className="global-loading-spinner" />
            <p className="global-loading-text">加载中...</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
