import React, { useState, useMemo } from 'react'
import { useAppStore } from '../store'
import { showToast } from './Toast'

const HistoryPage: React.FC = () => {
  const { history, openFileByPath, clearHistory, deleteHistoryItem } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')

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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // 过滤后的历史记录
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history
    return history.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [history, searchQuery])

  // 删除单个历史记录
  const handleDelete = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    deleteHistoryItem(path)
    showToast('已删除', 'success')
  }

  const getFileIcon = (name: string) => {
    if (name.endsWith('.md') || name.endsWith('.markdown')) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    )
  }

  return (
    <div className="history-page">
      {/* 头部 */}
      <div className="history-header">
        <h2>阅读历史</h2>
        {history.length > 0 && (
          <button onClick={clearHistory} className="clear-btn">
            清空历史
          </button>
        )}
      </div>

      {/* 搜索栏 */}
      <div className="history-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索历史记录..."
        />
      </div>

      {/* 记录计数 */}
      {history.length > 0 && (
        <div className="history-count">
          共 {filteredHistory.length} 条记录
        </div>
      )}

      {/* 历史列表 */}
      <div className="history-list">
        {filteredHistory.length === 0 ? (
          <div className="history-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>{searchQuery ? '未找到匹配的记录' : '暂无阅读历史'}</p>
            {!searchQuery && <span>阅读文件后将自动记录</span>}
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div
              key={item.id}
              className="history-item"
              onClick={() => openFileByPath(item.path)}
            >
              <div className="hi-icon">
                {getFileIcon(item.name)}
              </div>
              <div className="hi-info">
                <div className="hi-name">{item.name}</div>
                <div className="hi-meta">
                  <span className="hi-time">{formatDate(item.ts)}</span>
                  <span className="hi-dot" />
                  <span className="hi-size">{formatSize(item.size)}</span>
                </div>
              </div>
              <button 
                className="hi-delete"
                onClick={(e) => handleDelete(e, item.path)}
                title="删除"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default HistoryPage
