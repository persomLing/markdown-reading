import React, { useEffect } from 'react'
import { useAppStore } from './store'
import WelcomePage from './components/WelcomePage'
import FileBrowser from './components/FileBrowser'
import MarkdownReader from './components/MarkdownReader'
import HistoryPage from './components/HistoryPage'
import SettingsPage from './components/SettingsPage'
import BottomNav from './components/BottomNav'
import Toast from './components/Toast'

const App: React.FC = () => {
  const { currentPage, settings } = useAppStore()

  useEffect(() => {
    // 应用主题与字体
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.documentElement.setAttribute('data-font', settings.fontFamily)
  }, [settings.theme, settings.fontFamily])

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
    </div>
  )
}

export default App
