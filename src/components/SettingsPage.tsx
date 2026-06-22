import React from 'react'
import { useAppStore } from '../store'
import { ThemeName, FontFamily } from '../types'
import { showToast } from './Toast'

const THEMES: { id: ThemeName; name: string; desc: string; bg: string; surface: string; accent: string; text: string }[] = [
  { id: 'bamboo', name: '竹青', desc: '竹林清韵', bg: '#f3f6ef', surface: '#eaefe3', accent: '#789262', text: '#424c50' },
  { id: 'paper', name: '纸质', desc: '旧书泛黄', bg: '#f5f0e1', surface: '#efe8d6', accent: '#845a33', text: '#4a3728' },
  { id: 'porcelain', name: '瓷片', desc: '青瓷温润', bg: '#f5f8fa', surface: '#ecf2f0', accent: '#5b8c85', text: '#37474f' },
  { id: 'sunlight', name: '阳光', desc: '墨水暖阳', bg: '#fbf5e6', surface: '#f3ecda', accent: '#d4960a', text: '#2c3e5d' },
  { id: 'dark', name: '暗夜', desc: '深色护眼', bg: '#0a0a0a', surface: '#1a1a1a', accent: '#d4a853', text: '#e8e4dc' },
]

const FONTS: { id: FontFamily; name: string; sample: string; family: string }[] = [
  { id: 'serif', name: '衬线', sample: '永和九年', family: '"Noto Serif SC", serif' },
  { id: 'sans', name: '黑体', sample: '永和九年', family: '"Noto Sans SC", sans-serif' },
  { id: 'kai', name: '楷书', sample: '永和九年', family: '"Ma Shan Zheng", serif' },
  { id: 'xing', name: '行书', sample: '永和九年', family: '"Zhi Mang Xing", serif' },
  { id: 'cute', name: '可爱', sample: '永和九年', family: '"ZCOOL KuaiLe", sans-serif' },
]

const SettingsPage: React.FC = () => {
  const { settings, setTheme, setFontFamily, setFontSize, setLineHeight, setGithubToken, setCurrentPage } = useAppStore()
  const [tokenInput, setTokenInput] = React.useState(settings.githubToken || '')

  const handleThemeChange = (theme: ThemeName) => {
    setTheme(theme)
    document.documentElement.setAttribute('data-theme', theme)
  }

  const handleFontChange = (fontFamily: FontFamily) => {
    setFontFamily(fontFamily)
    document.documentElement.setAttribute('data-font', fontFamily)
  }

  const handleFontSizeChange = (size: number) => {
    if (size >= 12 && size <= 24) setFontSize(size)
  }

  const handleLineHeightChange = (height: number) => {
    if (height >= 1.2 && height <= 2.5) setLineHeight(height)
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button onClick={() => setCurrentPage('files')} className="back-btn" aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2>设置</h2>
      </div>

      <div className="settings-list">
        {/* 外观 —— 主题 */}
        <div className="setting-group">
          <h3>外观</h3>
          <div className="setting-card">
            <div className="setting-card-head">
              <div className="setting-title">阅读主题</div>
              <div className="setting-desc">点选切换全局配色与氛围</div>
            </div>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-card ${settings.theme === t.id ? 'active' : ''} ${t.id === 'dark' ? 'span-2' : ''}`}
                  onClick={() => handleThemeChange(t.id)}
                >
                  <span
                    className="theme-swatch"
                    style={{ background: t.bg, borderColor: t.surface }}
                  >
                    <span className="swatch-accent" style={{ background: t.accent }} />
                    <span className="swatch-text" style={{ color: t.text, background: t.surface }}>
                      永
                    </span>
                  </span>
                  <span className="theme-info">
                    <span className="theme-name">{t.name}</span>
                    <span className="theme-desc">{t.desc}</span>
                  </span>
                  {settings.theme === t.id && (
                    <svg className="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 阅读 —— 字体 + 排版 */}
        <div className="setting-group">
          <h3>阅读</h3>

          {/* 字体选择 */}
          <div className="setting-card">
            <div className="setting-card-head">
              <div className="setting-title">正文字体</div>
              <div className="setting-desc">选择阅读正文的字体气质</div>
            </div>
            <div className="font-grid">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`font-card ${settings.fontFamily === f.id ? 'active' : ''}`}
                  onClick={() => handleFontChange(f.id)}
                >
                  <span className="font-sample" style={{ fontFamily: f.family }}>
                    {f.sample}
                  </span>
                  <span className="font-name">{f.name}</span>
                  {settings.fontFamily === f.id && (
                    <svg className="font-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 排版：字号 + 行高 */}
          <div className="setting-card">
            <div className="setting-card-head">
              <div className="setting-title">排版</div>
              <div className="setting-desc">字号与行间距的精细调节</div>
            </div>

            <div className="layout-row">
              <div className="layout-label">
                <span>字号</span>
                <span className="value-badge">{settings.fontSize}px</span>
              </div>
              <div className="slider-row">
                <span className="slider-edge">小</span>
                <input
                  type="range"
                  className="slider"
                  min={12}
                  max={24}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                  style={{ ['--pct' as any]: `${((settings.fontSize - 12) / (24 - 12)) * 100}%` }}
                />
                <span className="slider-edge">大</span>
              </div>
            </div>

            <div className="layout-row">
              <div className="layout-label">
                <span>行距</span>
                <span className="value-badge">{settings.lh.toFixed(2)}</span>
              </div>
              <div className="slider-row">
                <span className="slider-edge">紧</span>
                <input
                  type="range"
                  className="slider"
                  min={1.2}
                  max={2.5}
                  step={0.05}
                  value={settings.lh}
                  onChange={(e) => handleLineHeightChange(Number(e.target.value))}
                  style={{ ['--pct' as any]: `${((settings.lh - 1.2) / (2.5 - 1.2)) * 100}%` }}
                />
                <span className="slider-edge">松</span>
              </div>
            </div>

            <div
              className="preview-box"
              style={{
                fontSize: settings.fontSize,
                lineHeight: settings.lh,
                fontFamily: FONTS.find((f) => f.id === settings.fontFamily)?.family,
              }}
            >
              <div>永和九年，岁在癸丑，暮春之初。</div>
              <div>群贤毕至，少长咸集。</div>
            </div>
          </div>
        </div>

        {/* GitHub */}
        <div className="setting-group">
          <h3>GitHub</h3>
          <div className="setting-card">
            <div className="setting-card-head">
              <div className="setting-title">GitHub Token</div>
              <div className="setting-desc">可选填入，提升 API 速率限制（60→5000 次/小时）</div>
            </div>
            <div className="gh-token-row">
              <input
                type="password"
                className="pwd-input"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ghp_xxxx 或 github_pat_xxxx"
              />
              <button
                className="gh-token-save"
                onClick={() => {
                  setGithubToken(tokenInput)
                  showToast('Token 已保存', 'success')
                }}
              >
                保存
              </button>
            </div>
            {settings.githubToken && (
              <button
                className="gh-token-clear"
                onClick={() => {
                  setTokenInput('')
                  setGithubToken('')
                  showToast('Token 已清除', 'success')
                }}
              >
                清除 Token
              </button>
            )}
          </div>
        </div>

        {/* 关于 */}
        <div className="setting-group">
          <h3>关于</h3>
          <div className="setting-card about-card">
            <div className="about-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="about-text">
              <h4>墨 · Reader</h4>
              <p>优雅的 Markdown 阅读器</p>
            </div>
            <span className="about-version">v1.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
