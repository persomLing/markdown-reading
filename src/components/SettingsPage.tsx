import React from 'react'
import { useAppStore } from '../store'
import { ThemeName, FontFamily, TtsEngine } from '../types'
import { showToast } from './Toast'
import bambooBg from '../assets/竹青色_竹影背景.webp'
import paperBg from '../assets/纸质感_旧纸背景.webp'
import porcelainBg from '../assets/瓷片感_白瓷冰裂纹.webp'
import sunlightBg from '../assets/阳光墨水_晴天背景.webp'
import darkBg from '../assets/暗夜黑_黑曜石背景.webp'

const THEME_TEXTURE_MAP: Record<ThemeName, string> = {
  bamboo: bambooBg,
  paper: paperBg,
  porcelain: porcelainBg,
  sunlight: sunlightBg,
  dark: darkBg,
}

const THEMES: { id: ThemeName; name: string; desc: string; bg: string; surface: string; accent: string; text: string }[] = [
  { id: 'bamboo', name: '竹青', desc: '苍翠修竹', bg: '#f3f6ee', surface: '#e7eee2', accent: '#3d7a50', text: '#222b24' },
  { id: 'paper', name: '纸质', desc: '古籍宣纸', bg: '#f6f1e3', surface: '#ede4cf', accent: '#a44335', text: '#282019' },
  { id: 'porcelain', name: '瓷片', desc: '天青温润', bg: '#f3f7f8', surface: '#e5eff0', accent: '#3b827e', text: '#202d33' },
  { id: 'sunlight', name: '阳光', desc: '墨水暖金', bg: '#fbf6ea', surface: '#f2e8d2', accent: '#b37418', text: '#1a263b' },
  { id: 'dark', name: '暗夜', desc: '黑曜金流', bg: '#0a0a0a', surface: '#181818', accent: '#dfb15b', text: '#eee9e0' },
]

const FONTS: { id: FontFamily; name: string; sample: string; family: string }[] = [
  { id: 'serif', name: '衬线', sample: '永和九年', family: '"Noto Serif SC", serif' },
  { id: 'sans', name: '黑体', sample: '永和九年', family: '"Noto Sans SC", sans-serif' },
  { id: 'kai', name: '楷书', sample: '永和九年', family: '"Ma Shan Zheng", serif' },
  { id: 'xing', name: '行书', sample: '永和九年', family: '"Zhi Mang Xing", serif' },
  { id: 'cute', name: '可爱', sample: '永和九年', family: '"ZCOOL KuaiLe", sans-serif' },
]

const SettingsPage: React.FC = () => {
  const { settings, setTheme, setFontFamily, setFontSize, setLineHeight, setGithubToken, setMimoApiKey, setSettings, setCurrentPage } = useAppStore()
  const [tokenInput, setTokenInput] = React.useState(settings.githubToken || '')
  const [mimoKeyInput, setMimoKeyInput] = React.useState(settings.mimoApiKey || '')
  const [showMimoKey, setShowMimoKey] = React.useState(false)
  const [rememberMimoKey, setRememberMimoKey] = React.useState(settings.mimoRememberApiKey)

  React.useEffect(() => {
    setMimoKeyInput(settings.mimoApiKey || '')
    setRememberMimoKey(Boolean(settings.mimoApiKey && settings.mimoRememberApiKey))
  }, [settings.mimoApiKey, settings.mimoRememberApiKey])

  const saveMimoApiKey = () => {
    const nextKey = mimoKeyInput.trim()
    if (!nextKey) {
      showToast('请先填写 MiMo API Key', 'error')
      return
    }
    if (nextKey.length < 16) {
      showToast('API Key 看起来不完整，请检查后重试', 'error')
      return
    }
    setMimoApiKey(nextKey, rememberMimoKey)
    setMimoKeyInput(nextKey)
    showToast(
      rememberMimoKey ? 'MiMo API Key 已保存在此设备' : 'MiMo API Key 已保存到本次会话',
      'success',
    )
  }

  const clearMimoApiKey = () => {
    setMimoKeyInput('')
    setMimoApiKey('', false)
    setRememberMimoKey(false)
    setShowMimoKey(false)
    showToast('本地 MiMo API Key 已清除', 'success')
  }

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
                    className="theme-swatch has-texture"
                    style={{
                      background: t.bg,
                      borderColor: t.surface,
                      backgroundImage: `url(${THEME_TEXTURE_MAP[t.id]})`,
                    }}
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

          <div className="setting-card" style={{ display: 'none' }}>
            <div className="setting-card-head">
              <div className="setting-title">语音朗读</div>
              <div className="setting-desc">默认使用浏览器 Web Speech API；可切换小米 MiMo-V2.5-TTS 获得更自然的云端语音</div>
            </div>
            <div className="tts-setting-grid">
              <label className="tts-setting-field">
                <span>朗读引擎</span>
                <select value={settings.ttsEngine} onChange={(event) => setSettings({ ttsEngine: event.target.value as TtsEngine })}>
                  <option value="browser">Web Speech API（默认）</option>
                  <option value="mimo">小米 MiMo-V2.5-TTS</option>
                </select>
              </label>
              <label className="tts-setting-field">
                <span>默认速度</span>
                <select value={String(settings.ttsSpeed)} onChange={(event) => setSettings({ ttsSpeed: Number(event.target.value) })}>
                  {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
                </select>
              </label>
              {settings.ttsEngine === 'mimo' && (
                <label className="tts-setting-field">
                  <span>MiMo 音色</span>
                  <select value={settings.ttsVoice} onChange={(event) => setSettings({ ttsVoice: event.target.value })}>
                    <option value="冰糖">冰糖 · 女声</option>
                    <option value="茉莉">茉莉 · 女声</option>
                    <option value="苏打">苏打 · 男声</option>
                    <option value="白桦">白桦 · 男声</option>
                    <option value="Mia">Mia · English</option>
                    <option value="Chloe">Chloe · English</option>
                    <option value="Milo">Milo · English</option>
                    <option value="Dean">Dean · English</option>
                  </select>
                </label>
              )}
            </div>
            {settings.ttsEngine === 'mimo' && (
              <>
                <label className="tts-style-field">
                  <span>MiMo 朗读风格</span>
                  <textarea
                    value={settings.ttsStyle}
                    maxLength={200}
                    onChange={(event) => setSettings({ ttsStyle: event.target.value })}
                    placeholder="例如：温柔自然，语速适中。"
                  />
                </label>

                <div className={`mimo-key-panel ${settings.mimoApiKey ? 'is-configured' : ''}`}>
                  <div className="mimo-key-head">
                    <div className="mimo-key-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="8" cy="15" r="4" />
                        <path d="m11 12 8-8m-2 2 2 2m-5 1 2 2" />
                      </svg>
                    </div>
                    <div className="mimo-key-title">
                      <strong>MiMo API Key</strong>
                      <small>用于生成小米云端语音</small>
                    </div>
                    <span className={`mimo-key-status ${settings.mimoApiKey ? 'is-ready' : ''}`}>
                      <i />
                      {settings.mimoApiKey
                        ? settings.mimoRememberApiKey ? '此设备已保存' : '本次会话已配置'
                        : '尚未配置'}
                    </span>
                  </div>

                  <div className="mimo-key-input-row">
                    <div className="mimo-key-input-wrap">
                      <input
                        type={showMimoKey ? 'text' : 'password'}
                        value={mimoKeyInput}
                        onChange={(event) => setMimoKeyInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveMimoApiKey()
                        }}
                        placeholder="sk-xxxxxxxxxxxxxxxx"
                        aria-label="MiMo API Key"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="mimo-key-visibility"
                        onClick={() => setShowMimoKey((visible) => !visible)}
                        title={showMimoKey ? '隐藏密钥' : '显示密钥'}
                        aria-label={showMimoKey ? '隐藏密钥' : '显示密钥'}
                      >
                        {showMimoKey ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M3 3 21 21" />
                            <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                            <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5 9 5a15 15 0 0 1-2.1 2.6M6.6 6.6C4.3 8.1 3 10 3 10s3.5 5 9 5a10.7 10.7 0 0 0 3.4-.5" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <button type="button" className="mimo-key-save" onClick={saveMimoApiKey}>保存密钥</button>
                  </div>

                  <div className="mimo-key-footer">
                    <div className="mimo-key-safety">
                      <p>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                          <path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z" />
                          <path d="m9.5 12 1.6 1.6 3.5-3.7" />
                        </svg>
                        密钥只发送给同源语音代理，默认关闭浏览器后清除。
                      </p>
                      <label className="mimo-key-remember">
                        <input
                          type="checkbox"
                          checked={rememberMimoKey}
                          onChange={(event) => setRememberMimoKey(event.target.checked)}
                        />
                        <span>在此设备记住</span>
                        <small>仅限私人设备，密钥会明文保存在浏览器中</small>
                      </label>
                    </div>
                    {settings.mimoApiKey && (
                      <button type="button" onClick={clearMimoApiKey}>
                        {settings.mimoRememberApiKey ? '清除此设备密钥' : '清除会话密钥'}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            <label className="tts-switch-row">
              <span>
                <strong>自动跟随段落</strong>
                <small>朗读时高亮并滚动到当前段落</small>
              </span>
              <input
                type="checkbox"
                checked={settings.ttsAutoScroll}
                onChange={(event) => setSettings({ ttsAutoScroll: event.target.checked })}
              />
            </label>
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
