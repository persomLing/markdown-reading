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
  const { currentPage, settings, loading } = useAppStore()
  const restoreAttempted = useRef(false)

  useEffect(() => {
    // 应用主题与字体
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.documentElement.setAttribute('data-font', settings.fontFamily)
  }, [settings.theme, settings.fontFamily])

  // 刷新后恢复阅读：currentPage 是 reader 但 curFile 为空时，自动打开 lastFile
  useEffect(() => {
    if (currentPage !== 'reader' || restoreAttempted.current) {
      // 离开 reader 页面时重置标记，下次回来可以再尝试
      if (currentPage !== 'reader') restoreAttempted.current = false
      return
    }

    const { curFile, lastFile } = useAppStore.getState()
    if (curFile) return
    if (!lastFile || !lastFile.path) {
      // 没有可恢复的文件，回退到文件列表
      useAppStore.getState().setCurrentPage('files')
      return
    }

    restoreAttempted.current = true
    useAppStore.getState().openFileByPath(lastFile.path, lastFile.sourceId, lastFile.sourceType).then((ok) => {
      if (!ok) {
        // 恢复失败，回退到文件列表
        useAppStore.getState().setCurrentPage('files')
      }
    })
  }, [currentPage])

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
