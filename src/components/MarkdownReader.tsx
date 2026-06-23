import React, { useEffect, useRef, useState, useCallback } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import html2canvas from 'html2canvas'
import { useAppStore } from '../store'
import { showToast } from './Toast'

// 检测移动端浏览器（手机浏览器普遍不支持 a.download，需长按保存）
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

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
      <div class="code-actions">
        <button class="fullscreen-btn" onclick="window.fullscreenCode(this)" title="全屏">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
        <button class="copy-btn" onclick="window.copyCode(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>复制</span>
        </button>
      </div>
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
    toggleSearch,
    sources,
    activeSourceId,
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

    // 全屏代码功能 - 使用浏览器原生全屏API
    (window as any).fullscreenCode = (btn: HTMLButtonElement) => {
      const codeBlock = btn.closest('.code-block')
      if (!codeBlock) return
      
      // 创建全屏容器
      const fullscreenDiv = document.createElement('div')
      fullscreenDiv.className = 'code-fullscreen-wrapper'
      
      // 创建头部
      const header = document.createElement('div')
      header.className = 'code-fullscreen-header'
      
      const langSpan = codeBlock.querySelector('.code-lang')
      const langText = langSpan?.textContent || 'text'
      
      header.innerHTML = `
        <span class="code-fullscreen-lang">${langText}</span>
        <div class="code-fullscreen-actions">
          <button class="code-fullscreen-copy" onclick="window.copyFullscreenCode(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>复制</span>
          </button>
          <button class="code-fullscreen-close" onclick="window.closeFullscreenCode()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
            </svg>
            <span>退出全屏</span>
          </button>
        </div>
      `
      
      // 克隆代码内容
      const pre = codeBlock.querySelector('pre')
      if (pre) {
        const clonedPre = pre.cloneNode(true)
        fullscreenDiv.appendChild(header)
        fullscreenDiv.appendChild(clonedPre)
      }
      
      // 存储引用用于关闭
      document.body.appendChild(fullscreenDiv)
      ;(window as any).__fullscreenCodeDiv = fullscreenDiv
      
      // 请求浏览器全屏
      if (fullscreenDiv.requestFullscreen) {
        fullscreenDiv.requestFullscreen()
      } else if ((fullscreenDiv as any).webkitRequestFullscreen) {
        (fullscreenDiv as any).webkitRequestFullscreen()
      } else if ((fullscreenDiv as any).msRequestFullscreen) {
        (fullscreenDiv as any).msRequestFullscreen()
      }
      
      // 尝试锁定横屏方向（移动端）
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          (screen.orientation as any).lock('landscape').catch(() => {
            // 某些设备可能不支持锁定方向，忽略错误
            console.log('无法锁定横屏方向')
          })
        }
      } catch (e) {
        // 忽略不支持的方向锁定
      }
      
      // 监听全屏状态变化
      const handleFullscreenChange = () => {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          // 退出全屏时清理DOM
          fullscreenDiv.remove()
          document.removeEventListener('fullscreenchange', handleFullscreenChange)
          document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
          
          // 解锁屏幕方向
          try {
            if (screen.orientation && (screen.orientation as any).unlock) {
              (screen.orientation as any).unlock()
            }
          } catch (e) {
            // 忽略解锁错误
          }
        }
      }
      document.addEventListener('fullscreenchange', handleFullscreenChange)
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    }

    // 关闭全屏
    (window as any).closeFullscreenCode = () => {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen()
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen()
      }
      
      // 解锁屏幕方向
      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock()
        }
      } catch (e) {
        // 忽略解锁错误
      }
    }

    // 全屏内复制代码
    (window as any).copyFullscreenCode = (btn: HTMLButtonElement) => {
      const code = btn.closest('.code-fullscreen-wrapper')?.querySelector('pre code')?.textContent || ''
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
      })
    }

    return () => {
      delete (window as any).copyCode
      delete (window as any).fullscreenCode
      delete (window as any).closeFullscreenCode
      delete (window as any).copyFullscreenCode
    }
  }, [])

  // 渲染 Markdown
  useEffect(() => {
    if (!curFile || !contentRef.current) return

    const renderMarkdown = async () => {
      // GitHub 源：构建图片路径重写所需的上下文
      const source = sources.find(s => s.id === activeSourceId)
      let baseRaw = ''
      let dirRaw = ''

      if (source?.type === 'github' && source.repoUrl) {
        const m = source.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)/)
        if (m) {
          const [, owner, repo, branch] = m
          baseRaw = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`
          const fileDir = curFile.path.includes('/')
            ? curFile.path.substring(0, curFile.path.lastIndexOf('/'))
            : ''
          dirRaw = fileDir ? baseRaw + fileDir + '/' : baseRaw
        }
      }

      let html: string
      if (baseRaw) {
        // 为 GitHub 源创建自定义渲染器，重写图片 URL
        const customRenderer = new marked.Renderer()
        customRenderer.code = renderer.code.bind(customRenderer)
        customRenderer.image = function (href: string, title: string | null, text: string): string {
          let src = href
          if (src && !/^https?:\/\//i.test(src) && !src.startsWith('data:')) {
            if (src.startsWith('/')) {
              src = baseRaw + src.substring(1)
            } else if (src.startsWith('./')) {
              src = dirRaw + src.substring(2)
            } else if (src.startsWith('../')) {
              // 处理 ../ 相对路径
              const parts = curFile.path.split('/').slice(0, -1)
              let rel = src
              while (rel.startsWith('../')) {
                parts.pop()
                rel = rel.substring(3)
              }
              src = baseRaw + (parts.length ? parts.join('/') + '/' : '') + rel
            } else {
              src = dirRaw + src
            }
          }
          const titleAttr = title ? ` title="${title}"` : ''
          return `<img src="${src}" alt="${text}"${titleAttr}>`
        }
        html = await marked.parse(curFile.content, { renderer: customRenderer })
      } else {
        html = await marked(curFile.content)
      }
      if (contentRef.current) {
        contentRef.current.innerHTML = html

        // 给表格包一层滚动容器，防止宽表格撑破页面
        wrapTables()

        // 生成目录
        generateToc()
        
        // 为内部锚点链接添加点击事件
        setupAnchorLinks()
        
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
      // 生成与 Markdown 锚点链接格式匹配的 ID
      const text = heading.textContent || ''
      const id = text
        .toLowerCase()
        .replace(/[\s\p{P}]+/gu, '') // 去掉空格和标点符号
        .replace(/[^\w\u4e00-\u9fa5]/g, '') // 保留字母、数字和中文
      
      heading.id = id || `heading-${index}`
      
      items.push({
        id: heading.id,
        text,
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

  // 清除搜索高亮函数
  const clearSearchHighlight = () => {
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

  // 监听搜索关闭，清除高亮
  useEffect(() => {
    if (!searchOpen) {
      clearSearchHighlight()
      setSearchQuery('')
      setSearchResults([])
      setCurrentSearchIndex(-1)
    }
  }, [searchOpen])

  // 清除搜索高亮
  useEffect(() => {
    return () => {
      clearSearchHighlight()
    }
  }, [curFile])

  // 滚动到目录项
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      toggleToc()
      
      // 添加视觉反馈 - 目标标题短暂高亮
      element.style.transition = 'background-color 0.3s ease'
      element.style.backgroundColor = 'var(--accent-dim)'
      setTimeout(() => {
        element.style.backgroundColor = ''
      }, 1500)
    }
  }

  // 设置内部锚点链接的点击事件
  const setupAnchorLinks = () => {
    if (!contentRef.current || contentRef.current.dataset.anchorListener) return
    
    // 标记已添加事件监听器
    contentRef.current.dataset.anchorListener = 'true'
    
    // 使用事件委托，避免重复绑定事件
    contentRef.current.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const link = target.closest('a[href^="#"]') as HTMLAnchorElement
      
      if (link) {
        e.preventDefault()
        const href = link.getAttribute('href')
        if (!href) return
        
        const targetId = decodeURIComponent(href.substring(1)) // 去掉 # 并解码URL
        const targetElement = document.getElementById(targetId)
        
        if (targetElement) {
          // 平滑滚动到目标位置
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          
          // 添加视觉反馈 - 目标标题短暂高亮
          targetElement.style.transition = 'background-color 0.3s ease'
          targetElement.style.backgroundColor = 'var(--accent-dim)'
          setTimeout(() => {
            targetElement.style.backgroundColor = ''
          }, 1500)
        }
      }
    })
  }

  // 截图功能
  const takeScreenshot = useCallback(async () => {
    if (!contentRef.current) return
    showToast('正在生成截图...', 'info')
    try {
      const el = contentRef.current
      const origPadding = el.style.padding

      // 临时加 padding，还原阅读页面边距效果
      el.style.padding = '24px 20px'

      const canvas = await html2canvas(el, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        scale: 1,
        useCORS: true,
        logging: false,
      })

      // 恢复原始 padding
      el.style.padding = origPadding

      if (isMobile) {
        // 手机端：JPEG data URL，显示预览弹窗供长按保存
        const url = canvas.toDataURL('image/jpeg', 0.85)
        if (screenshot) URL.revokeObjectURL(screenshot)
        setScreenshot(url)
      } else {
        // 桌面端：直接下载，不走弹窗
        const url = canvas.toDataURL('image/jpeg', 0.92)
        const a = document.createElement('a')
        a.download = (curFile?.name || 'screenshot') + '.jpg'
        a.href = url
        a.click()
        showToast('截图已保存', 'success')
      }
    } catch (e) {
      console.error('截图失败:', e)
      showToast('截图生成失败', 'error')
    }
  }, [screenshot, curFile])

  // 保存截图
  const saveScreenshot = useCallback(() => {
    if (!screenshot) return
    const a = document.createElement('a')
    a.download = (curFile?.name || 'screenshot') + '.png'
    a.href = screenshot
    a.click()
    URL.revokeObjectURL(screenshot)
    setScreenshot(null)
    showToast('截图已保存', 'success')
  }, [screenshot, curFile])

  // 关闭截图弹窗并释放 Blob URL
  const closeScreenshot = useCallback(() => {
    if (screenshot) URL.revokeObjectURL(screenshot)
    setScreenshot(null)
  }, [screenshot])

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
        <div className="screenshot-overlay" onClick={closeScreenshot}>
          {isMobile ? (
            <>
              <div className="screenshot-fullscroll" onClick={(e) => e.stopPropagation()}>
                <img src={screenshot} alt="screenshot" />
              </div>
              <button className="screenshot-close-btn" onClick={closeScreenshot}>×</button>
              <div className="screenshot-bottom-tip" onClick={closeScreenshot}>
                <p>长按图片保存到相册</p>
              </div>
            </>
          ) : (
            <div className="screenshot-modal" onClick={(e) => e.stopPropagation()}>
              <img src={screenshot} alt="screenshot" />
              <div className="screenshot-actions">
                <button className="btn-cancel" onClick={closeScreenshot}>关闭</button>
                <button className="btn-save" onClick={saveScreenshot}>保存图片</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MarkdownReader
