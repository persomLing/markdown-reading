import React, { useState, useEffect } from 'react'

interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let toastId = 0
let addToastFn: ((message: string, type?: 'success' | 'error' | 'info') => void) | null = null

// 全局 toast 函数
export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  if (addToastFn) {
    addToastFn(message, type)
  }
}

const Toast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    addToastFn = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = ++toastId
      setToasts(prev => [...prev, { id, message, type }])
      
      // 3秒后自动移除
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 3000)
    }

    return () => {
      addToastFn = null
    }
  }, [])

  const getIcon = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )
      case 'error':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )
      case 'info':
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )
    }
  }

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
        >
          <div className="toast-icon">
            {getIcon(toast.type)}
          </div>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

export default Toast
