import React, { useEffect, useRef, useState, useCallback } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import html2canvas from 'html2canvas'
import { useAppStore } from '../store'
import { showToast } from './Toast'

// 配置 marked
const renderer = new marked.Renderer()

// 自定义代码块渲染
renderer.code = function(code: string, language: string | undefined) {
  const validLang = language && hljs.getLanguage(language)
  const highlighted = validLang 
    ? hljs.highlight(code, { language }).value
    : hljs.highlightAuto(code).value
  
  return `<div class="code-block">
    <div class="code-header">
      <span class="code-lang">${language || 'text'}</span>
      <button class="copy-btn" onclick="window.copyCode(this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>复制</span>
      </button>
    </div>
    <pre><code class="hljs language-${language || 'auto'}">${highlighted}</code></pre>
  </div>`
}

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
})

interface TocItem {
  id: string
  text: string
  level: number
}

const MarkdownReader: React.FC = () => {
  const { 
    curFile, 
    settings, 
    tocOpen, 
    searchOpen,
    setCurrentPage, 
    toggleToc, 
    toggleSearch 
  } = useAppStore()
  
  const [toc, setToc] = useState<TocItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Element[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1)
  const [progress, setProgress] = useState(0)
  
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)

  // 复制代码功能
  useEffect(() => {
    (window as any).copyCode = (btn: HTMLButtonElement) => {
      const code = btn.closest('.code-block')?.querySelector('pre code')?.textContent || ''
      navigator.clipboard.writeText(code).then(() => {
        const span = btn.querySelector('span')
        if (span) {
          btn.classList.add('copied')
          span.textContent = '已复制'
          setTimeout(() => {
            btn.classList.remove('copied')
            span.textContent = '复制'
          }, 2000)
        }
      }).catch(() => {
        // 降级方案
        const textarea = document.createElement('textarea')
        textarea.value = code
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        const span = btn.querySelector('span')
        if (span) {
          btn.classList.add('copied')
          span.textContent = '已复制'
          setTimeout(() => {
            btn.classList.remove('copied')
            span.textContent = '复制'
          }, 2000)
        }
      })
    }

    return () => {
      delete (window as any).copyCode
    }
  }, [])

  // 渲染 Markdown
  useEffect(() => {
    if (!curFile || !contentRef.current) return

    const renderMarkdown = async () => {
      const html = await marked(curFile.content)
      if (contentRef.current) {
        contentRef.current.innerHTML = html

        // 给表格包一层滚动容器，防止宽表格撑破页面
        wrapTables()

        // 生成目录
        generateToc()
        
        // 恢复滚动位置
        const savedScroll = localStorage.getItem(`scroll-${curFile.path}`)
        if (savedScroll && scrollRef.current) {
          scrollRef.current.scrollTop = parseInt(savedScroll)
        }
      }
    }

    renderMarkdown()
  }, [curFile])

  // 为每个表格包裹滚动容器
  const wrapTables = () => {
    if (!contentRef.current) return
    contentRef.current.querySelectorAll('table').forEach((table) => {
      // 避免重复包裹
      if (table.parentElement?.classList.contains('md-table-scroll')) return
      const scroll = document.createElement('div')
      scroll.className = 'md-table-scroll'
      const wrap = document.createElement('div')
      wrap.className = 'md-table'
      scroll.appendChild(table.cloneNode(true))
      wrap.appendChild(scroll)
      table.replaceWith(wrap)
    })
  }

  // 生成目录
  const generateToc = () => {
    if (!contentRef.current) return

    const headings = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const items: TocItem[] = []

    headings.forEach((heading, index) => {
      const id = `heading-${index}`
      heading.id = id
      
      items.push({
        id,
        text: heading.textContent || '',
        level: parseInt(heading.tagName.charAt(1))
      })
    })

    setToc(items)
  }

  // 滚动监听
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      const newProgress = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100)
      setProgress(newProgress)
      
      // 保存滚动位置
      if (curFile) {
        localStorage.setItem(`scroll-${curFile.path}`, scrollTop.toString())
      }
    }

    scrollElement.addEventListener('scroll', handleScroll)
    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [curFile])

  // 搜索功能 - 高亮显示
  const highlightSearch = useCallback(() => {
    if (!contentRef.current) return
    
    // 先清除之前的高亮
    const marks = contentRef.current.querySelectorAll('mark.search-highlight')
    marks.forEach(mark => {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      }
    })

    if (!searchQuery.trim()) {
      setSearchResults([])
      setCurrentSearchIndex(-1)
      return
    }

    // 在文本节点中查找并高亮
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT
    )

    const textNodes: Text[] = []
    let node
    while (node = walker.nextNode()) {
      textNodes.push(node as Text)
    }

    const highlights: Element[] = []
    
    textNodes.forEach(textNode => {
      const text = textNode.textContent || ''
      const lowerText = text.toLowerCase()
      const lowerQuery = searchQuery.toLowerCase()
      
      if (!lowerText.includes(lowerQuery)) return
      
      const fragment = document.createDocumentFragment()
      let lastIndex = 0
      let index = lowerText.indexOf(lowerQuery)
      
      while (index !== -1) {
        // 添加前面的文本
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)))
        }
        
        // 创建高亮标记
        const mark = document.createElement('mark')
        mark.className = 'search-highlight'
        mark.textContent = text.slice(index, index + searchQuery.length)
        fragment.appendChild(mark)
        highlights.push(mark)
        
        lastIndex = index + searchQuery.length
        index = lowerText.indexOf(lowerQuery, lastIndex)
      }
      
      // 添加剩余文本
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }
      
      textNode.parentNode?.replaceChild(fragment, textNode)
    })

    setSearchResults(highlights)
    setCurrentSearchIndex(highlights.length > 0 ? 0 : -1)
    
    // 滚动到第一个高亮位置
    if (highlights.length > 0) {
      highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchQuery])

  // 执行搜索
  useEffect(() => {
    highlightSearch()
  }, [searchQuery, curFile])

  // 导航到搜索结果
  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return

    let newIndex: number
    if (direction === 'next') {
      newIndex = (currentSearchIndex + 1) % searchResults.length
    } else {
      newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length
    }
    
    setCurrentSearchIndex(newIndex)
    
    // 滚动到当前高亮位置
    const highlight = searchResults[newIndex] as HTMLElement
    if (highlight) {
      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // 清除搜索高亮
  useEffect(() => {
    return () => {
      if (contentRef.current) {
        const marks = contentRef.current.querySelectorAll('mark.search-highlight')
        marks.forEach(mark => {
          const parent = mark.parentNode
          if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
            parent.normalize()
          }
        })
      }
    }
  }, [curFile])

  // 滚动到目录项
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      toggleToc()
    }
  }

  // 截图功能
  const takeScreenshot = useCallback(async () => {
    if (!contentRef.current) return
    showToast('正在生成截图...', 'info')
    try {
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        scale: 2,
        useCORS: true,
        logging: false,
      })
      setScreenshot(canvas.toDataURL('image/png'))
    } catch (e) {
      showToast('截图生成失败', 'error')
    }
  }, [])

  // 保存截图
  const saveScreenshot = useCallback(() => {
    if (!screenshot) return
    const a = document.createElement('a')
    a.download = (curFile?.name || 'screenshot') + '.png'
    a.href = screenshot
    a.click()
    setScreenshot(null)
    showToast('截图已保存', 'success')
  }, [screenshot, curFile])

  if (!curFile) {
    return (
      <div className="reader-empty">
        <p>未选择文件</p>
        <button onClick={() => setCurrentPage('files')}>
          返回文件列表
        </button>
      </div>
    )
  }

  return (
    <div className="reader">
      {/* 主题阅读背景图层 */}
      <div className="reader-bg" />

      {/* 头部 */}
      <div className="reader-header">
        <button onClick={() => setCurrentPage('files')} className="back-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="reader-title">{curFile.name}</div>
        <div className="reader-actions">
          <button onClick={toggleToc} title="目录">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button onClick={toggleSearch} title="搜索">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button onClick={takeScreenshot} title="截图">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        </div>
      </div>

      {/* 进度条 */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* 搜索栏 */}
      {searchOpen && (
        <div className="search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') toggleSearch()
            }}
            placeholder="搜索内容..."
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="search-nav">
              <span>{currentSearchIndex + 1}/{searchResults.length}</span>
              <button onClick={() => navigateSearch('prev')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button onClick={() => navigateSearch('next')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          )}
          <button onClick={toggleSearch} className="close-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* 目录侧边栏 */}
      {tocOpen && (
        <div className="toc-sidebar">
          <div className="toc-header">
            <h3>目录</h3>
            <button onClick={toggleToc}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="toc-content">
            {toc.map((item) => (
              <div
                key={item.id}
                className={`toc-item level-${item.level}`}
                onClick={() => scrollToHeading(item.id)}
              >
                {item.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className="reader-content" ref={scrollRef}>
        <div 
          className="markdown-body"
          ref={contentRef}
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lh,
          }}
        />
      </div>

      {/* 截图预览弹窗 */}
      {screenshot && (
        <div className="screenshot-overlay" onClick={() => setScreenshot(null)}>
          <div className="screenshot-modal" onClick={(e) => e.stopPropagation()}>
            <img src={screenshot} alt="screenshot" />
            <div className="screenshot-actions">
              <button className="btn-cancel" onClick={() => setScreenshot(null)}>关闭</button>
              <button className="btn-save" onClick={saveScreenshot}>保存图片</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MarkdownReader
