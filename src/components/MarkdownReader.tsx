import React, { useEffect, useRef, useState, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { useAppStore } from '../store'
import { showToast } from './Toast'
import type { ThemeName, FontFamily } from '../types'
import bambooBg from '../assets/竹青色_竹影背景.webp'
import paperBg from '../assets/纸质感_旧纸背景.webp'
import porcelainBg from '../assets/瓷片感_白瓷冰裂纹.webp'
import sunlightBg from '../assets/阳光墨水_晴天背景.webp'
import darkBg from '../assets/暗夜黑_黑曜石背景.webp'

// 检测移动端浏览器（手机浏览器普遍不支持 a.download，需长按保存）
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerAliases(['c', 'h', 'cc'], { languageName: 'cpp' })
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })

const getScrollKey = (sourceId: string | null, path: string) =>
  `scroll-${sourceId || 'unknown'}-${path}`

const getReadingProgress = (element: HTMLElement) => {
  const maxScroll = element.scrollHeight - element.clientHeight
  if (maxScroll <= 0) return 100
  return Math.min(100, Math.max(0, Math.round((element.scrollTop / maxScroll) * 100)))
}

const copyText = async (button: HTMLButtonElement, text: string) => {
  const label = button.querySelector('span')
  button.classList.add('copied')
  if (label) label.textContent = '已复制'

  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  window.setTimeout(() => {
    button.classList.remove('copied')
    if (label) label.textContent = '复制'
  }, 2000)
}

const copyCode = (button: HTMLButtonElement) => {
  const code = button.closest('.code-block')?.querySelector('pre code')?.textContent || ''
  return copyText(button, code)
}

const openFullscreenCode = (button: HTMLButtonElement) => {
  const codeBlock = button.closest('.code-block')
  const sourcePre = codeBlock?.querySelector('pre')
  if (!codeBlock || !sourcePre) return

  const wrapper = document.createElement('div')
  wrapper.className = 'code-fullscreen-wrapper'
  const header = document.createElement('div')
  header.className = 'code-fullscreen-header'
  header.innerHTML = `
    <span class="code-fullscreen-lang"></span>
    <div class="code-fullscreen-actions">
      <button class="code-fullscreen-copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>复制</span>
      </button>
      <button class="code-fullscreen-close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
        <span>退出全屏</span>
      </button>
    </div>`
  const lang = header.querySelector<HTMLElement>('.code-fullscreen-lang')
  if (lang) lang.textContent = codeBlock.querySelector('.code-lang')?.textContent || 'text'
  wrapper.append(header, sourcePre.cloneNode(true))
  document.body.appendChild(wrapper)

  const cleanup = () => {
    wrapper.remove()
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  }
  const handleFullscreenChange = () => {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) cleanup()
  }
  const close = async () => {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
    else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen()
    } else cleanup()
  }

  header.querySelector<HTMLButtonElement>('.code-fullscreen-copy')?.addEventListener('click', (event) => {
    const copyButton = event.currentTarget as HTMLButtonElement
    void copyText(copyButton, sourcePre.textContent || '')
  })
  header.querySelector<HTMLButtonElement>('.code-fullscreen-close')?.addEventListener('click', () => void close())
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

  const request = wrapper.requestFullscreen?.() || (wrapper as any).webkitRequestFullscreen?.()
  if (request?.catch) request.catch(() => undefined)
}

// 配置 marked
const renderer = new marked.Renderer()

// 代码块中的 ASCII/Unicode 流程图依赖字符位置，不能交给 highlightAuto
// （未标注语言的图表很容易被误判成 CSS/JSON），也不能让 HTML 标记介入布局。
const escapeCodeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const isDiagramCode = (code: string) =>
  /[┌┐└┘├┤┬┴┼│─═║╔╗╚╝╠╣╦╩╬]/u.test(code) ||
  /(?:^|\n)\s*[+|].*(?:[+|]|-{3,}|={3,})\s*(?:\n|$)/u.test(code)

// 自定义代码块渲染
renderer.code = function(code: string, language: string | undefined) {
  const normalizedLanguage = language?.trim().toLowerCase() || ''
  const diagram = !normalizedLanguage && isDiagramCode(code)
  const validLang = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
  // 只有用户明确指定且已注册的语言才高亮；纯文本/流程图必须原样输出。
  const highlighted = validLang && !diagram
    ? hljs.highlight(code, { language: normalizedLanguage }).value
    : escapeCodeHtml(code)
  const codeClass = [
    'hljs',
    normalizedLanguage ? `language-${normalizedLanguage}` : 'language-text',
    diagram ? 'code-diagram-content' : '',
  ].filter(Boolean).join(' ')

  return `<div class="code-block">
    <div class="code-header">
      <span class="code-lang">${normalizedLanguage || 'text'}</span>
      <div class="code-actions">
        <button class="fullscreen-btn" data-code-action="fullscreen" title="全屏">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
        <button class="copy-btn" data-code-action="copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>复制</span>
        </button>
      </div>
    </div>
    <pre class="${diagram ? 'code-diagram' : ''}"><code class="${codeClass}">${highlighted}</code></pre>
  </div>`
}

// 自定义表格渲染：预先包裹自适应水平滚动容器
renderer.table = function (header: string, body: string) {
  return `<div class="md-table"><div class="md-table-scroll"><table>\n<thead>\n${header}</thead>\n${body ? `<tbody>\n${body}</tbody>\n` : ''}</table></div></div>\n`
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

const READER_THEMES: { id: ThemeName; name: string; bg: string; surface: string; accent: string; text: string; texture: string }[] = [
  { id: 'bamboo', name: '竹青', bg: '#f3f6ee', surface: '#e7eee2', accent: '#3d7a50', text: '#222b24', texture: bambooBg },
  { id: 'paper', name: '纸质', bg: '#f6f1e3', surface: '#ede4cf', accent: '#a44335', text: '#282019', texture: paperBg },
  { id: 'porcelain', name: '瓷片', bg: '#f3f7f8', surface: '#e5eff0', accent: '#3b827e', text: '#202d33', texture: porcelainBg },
  { id: 'sunlight', name: '阳光', bg: '#fbf6ea', surface: '#f2e8d2', accent: '#b37418', text: '#1a263b', texture: sunlightBg },
  { id: 'dark', name: '暗夜', bg: '#0a0a0a', surface: '#181818', accent: '#dfb15b', text: '#eee9e0', texture: darkBg },
]

const READER_FONTS: { id: FontFamily; name: string; sample: string; family: string }[] = [
  { id: 'serif', name: '衬线', sample: '永', family: '"Noto Serif SC", serif' },
  { id: 'sans', name: '黑体', sample: '永', family: '"Noto Sans SC", sans-serif' },
  { id: 'kai', name: '楷书', sample: '永', family: '"Ma Shan Zheng", serif' },
  { id: 'xing', name: '行书', sample: '永', family: '"Zhi Mang Xing", serif' },
  { id: 'cute', name: '可爱', sample: '永', family: '"ZCOOL KuaiLe", sans-serif' },
]

const MarkdownReader: React.FC = () => {
  const { 
    curFile, 
    settings, 
    tocOpen, 
    searchOpen,
    setCurrentPage, 
    toggleToc, 
    toggleSearch,
    setTheme,
    setFontFamily,
    setFontSize,
    setLineHeight,
    sources,
    activeSourceId,
  } = useAppStore()
  
  const [toc, setToc] = useState<TocItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Element[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1)
  const [progress, setProgress] = useState(0)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const appearancePanelRef = useRef<HTMLDivElement>(null)
  
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)

  const toggleAppearance = () => {
    setAppearanceOpen((open) => !open)
  }

  // 点击外部或按 ESC 关闭外观面板
  useEffect(() => {
    if (!appearanceOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        appearancePanelRef.current &&
        !appearancePanelRef.current.contains(target) &&
        !target.closest('.appearance-trigger-btn')
      ) {
        setAppearanceOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAppearanceOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [appearanceOpen])



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
        customRenderer.table = renderer.table.bind(customRenderer)
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
        contentRef.current.innerHTML = DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true, svg: true, svgFilters: true },
        })

        // 给表格包一层滚动容器，防止宽表格撑破页面
        wrapTables()

        // 生成目录
        generateToc()
        
        // 为内部锚点链接添加点击事件
        setupAnchorLinks()
        setupCodeActions()
        
        // 恢复滚动位置
        const savedScroll = localStorage.getItem(getScrollKey(activeSourceId, curFile.path))
        if (savedScroll && scrollRef.current) {
          scrollRef.current.scrollTop = parseInt(savedScroll)
        }
        if (scrollRef.current) {
          setProgress(getReadingProgress(scrollRef.current))
        }
      }
    }

    renderMarkdown()
  }, [curFile, sources, activeSourceId])

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
    let frameId: number | null = null

    const handleScroll = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        setProgress(getReadingProgress(scrollElement))

        // 每帧最多写入一次，避免滚动时频繁同步操作 localStorage
        if (curFile) {
          localStorage.setItem(
            getScrollKey(activeSourceId, curFile.path),
            scrollElement.scrollTop.toString()
          )
        }
      })
    }

    scrollElement.addEventListener('scroll', handleScroll)
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [curFile, activeSourceId])

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
    
    // 滚动到第一个高亮位置并标记 active
    if (highlights.length > 0) {
      highlights[0].classList.add('active')
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

    if (currentSearchIndex >= 0 && searchResults[currentSearchIndex]) {
      searchResults[currentSearchIndex].classList.remove('active')
    }

    let newIndex: number
    if (direction === 'next') {
      newIndex = (currentSearchIndex + 1) % searchResults.length
    } else {
      newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length
    }
    
    setCurrentSearchIndex(newIndex)
    
    // 滚动到当前高亮位置并标记 active
    const highlight = searchResults[newIndex] as HTMLElement
    if (highlight) {
      highlight.classList.add('active')
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
      
      // 添加视觉反馈 - 目标标题短暂高亮
      element.style.transition = 'background-color 0.3s ease'
      element.style.backgroundColor = 'var(--accent-dim)'
      setTimeout(() => {
        element.style.backgroundColor = ''
      }, 1500)
    }

    // 移动端选择目录项后自动收起目录
    if (window.innerWidth <= 768) {
      toggleToc()
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

  const setupCodeActions = () => {
    if (!contentRef.current || contentRef.current.dataset.codeListener) return
    contentRef.current.dataset.codeListener = 'true'
    contentRef.current.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-code-action]')
      if (!button) return

      const action = button.dataset.codeAction
      if (action === 'copy') void copyCode(button)
      if (action === 'fullscreen') openFullscreenCode(button)
    })
  }

  // 截图功能
  const takeScreenshot = useCallback(async () => {
    if (!contentRef.current) return
    showToast('正在生成截图...', 'info')
    const el = contentRef.current
    const origPadding = el.style.padding
    try {
      const { default: html2canvas } = await import('html2canvas')

      // 临时加 padding，还原阅读页面边距效果
      el.style.padding = '24px 20px'

      const canvas = await html2canvas(el, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        scale: 1,
        useCORS: true,
        logging: false,
      })

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
    } finally {
      el.style.padding = origPadding
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

      <div className="reader-shell">
        {/* 目录侧边栏与移动端遮罩 */}
        {tocOpen && (
          <>
            <div
              className="toc-backdrop"
              onClick={toggleToc}
              aria-label="关闭目录"
            />
            <aside className="toc-sidebar">
              <div className="toc-header">
                <h3>目录</h3>
                <button onClick={toggleToc} title="关闭目录">
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
            </aside>
          </>
        )}

        <div className="reader-main">
          {/* 头部 */}
          <div className="reader-header">
            <button onClick={() => setCurrentPage('files')} className="back-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="reader-title">{curFile.name}</div>
            <div className="reader-actions">
              <button
                onClick={toggleAppearance}
                className={`appearance-trigger-btn ${appearanceOpen ? 'active' : ''}`}
                title="外观与排版"
                aria-label="外观与排版"
              >
                <span className="reader-aa-badge">Aa</span>
              </button>
              <button onClick={toggleToc} className={tocOpen ? 'active' : ''} title="目录">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              <button onClick={toggleSearch} className={searchOpen ? 'active' : ''} title="搜索">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              <button onClick={takeScreenshot} title="截图">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1 2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
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

          {/* 外观与排版控制面板 */}
          {appearanceOpen && (
            <>
              <div
                className="reader-appearance-backdrop"
                onClick={() => setAppearanceOpen(false)}
              />
              <div className="reader-appearance-panel" ref={appearancePanelRef}>
                <div className="rap-header">
                  <div className="rap-title">外观与排版</div>
                  <button
                    className="rap-close-btn"
                    onClick={() => setAppearanceOpen(false)}
                    aria-label="关闭"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* 主题选择 */}
                <div className="rap-section">
                  <div className="rap-section-label">阅读主题</div>
                  <div className="rap-theme-grid">
                    {READER_THEMES.map((t) => (
                      <button
                        key={t.id}
                        className={`rap-theme-item ${settings.theme === t.id ? 'active' : ''}`}
                        onClick={() => setTheme(t.id)}
                        title={t.name}
                      >
                        <span
                          className="rap-theme-swatch"
                          style={{
                            background: t.bg,
                            backgroundImage: `url(${t.texture})`,
                            borderColor: t.surface,
                          }}
                        >
                          <span className="rap-theme-accent" style={{ background: t.accent }} />
                          {settings.theme === t.id && (
                            <span className="rap-theme-check">✓</span>
                          )}
                        </span>
                        <span className="rap-theme-name">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 字体选择 */}
                <div className="rap-section">
                  <div className="rap-section-label">正文字体</div>
                  <div className="rap-font-grid">
                    {READER_FONTS.map((f) => (
                      <button
                        key={f.id}
                        className={`rap-font-item ${settings.fontFamily === f.id ? 'active' : ''}`}
                        onClick={() => setFontFamily(f.id)}
                        style={{ fontFamily: f.family }}
                      >
                        <span className="rap-font-sample">{f.sample}</span>
                        <span className="rap-font-name">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 字号调节 */}
                <div className="rap-section">
                  <div className="rap-section-label">
                    <span>字号</span>
                    <span className="rap-val-badge">{settings.fontSize}px</span>
                  </div>
                  <div className="rap-control-row">
                    <button
                      className="rap-step-btn"
                      onClick={() => setFontSize(Math.max(12, settings.fontSize - 1))}
                      disabled={settings.fontSize <= 12}
                      aria-label="缩小字号"
                    >
                      A-
                    </button>
                    <input
                      type="range"
                      className="slider"
                      min={12}
                      max={24}
                      step={1}
                      value={settings.fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      style={{ ['--pct' as any]: `${((settings.fontSize - 12) / (24 - 12)) * 100}%` }}
                    />
                    <button
                      className="rap-step-btn"
                      onClick={() => setFontSize(Math.min(24, settings.fontSize + 1))}
                      disabled={settings.fontSize >= 24}
                      aria-label="放大字号"
                    >
                      A+
                    </button>
                  </div>
                </div>

                {/* 行距调节 */}
                <div className="rap-section">
                  <div className="rap-section-label">
                    <span>行距</span>
                    <span className="rap-val-badge">{settings.lh.toFixed(2)}</span>
                  </div>
                  <div className="rap-lh-presets">
                    {[
                      { label: '紧凑', val: 1.5 },
                      { label: '适中', val: 1.8 },
                      { label: '宽松', val: 2.1 },
                    ].map((p) => (
                      <button
                        key={p.val}
                        className={`rap-lh-chip ${Math.abs(settings.lh - p.val) < 0.08 ? 'active' : ''}`}
                        onClick={() => setLineHeight(p.val)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="rap-control-row" style={{ marginTop: '8px' }}>
                    <span className="rap-edge-text">紧</span>
                    <input
                      type="range"
                      className="slider"
                      min={1.3}
                      max={2.4}
                      step={0.05}
                      value={settings.lh}
                      onChange={(e) => setLineHeight(Number(e.target.value))}
                      style={{ ['--pct' as any]: `${((settings.lh - 1.3) / (2.4 - 1.3)) * 100}%` }}
                    />
                    <span className="rap-edge-text">松</span>
                  </div>
                </div>
              </div>
            </>
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
        </div>
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
