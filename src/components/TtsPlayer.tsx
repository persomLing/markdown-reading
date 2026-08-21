import React from 'react'
import type { Settings, TtsEngine } from '../types'

type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface TtsPlayerProps {
  status: TtsStatus
  engine: TtsEngine
  error: string
  fallbackReason: string
  currentIndex: number
  segmentCount: number
  settings: Settings
  onEngineChange: (engine: TtsEngine) => void
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onVoiceChange: (voice: string) => void
  onSpeedChange: (speed: number) => void
}

const VOICES = [
  { value: '冰糖', label: '冰糖 · 女声' },
  { value: '茉莉', label: '茉莉 · 女声' },
  { value: '苏打', label: '苏打 · 男声' },
  { value: '白桦', label: '白桦 · 男声' },
  { value: 'Mia', label: 'Mia · English' },
  { value: 'Chloe', label: 'Chloe · English' },
  { value: 'Milo', label: 'Milo · English' },
  { value: 'Dean', label: 'Dean · English' },
]

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {children}
  </svg>
)

const TtsPlayer: React.FC<TtsPlayerProps> = ({
  status,
  engine,
  error,
  fallbackReason,
  currentIndex,
  segmentCount,
  settings,
  onEngineChange,
  onToggle,
  onPrevious,
  onNext,
  onVoiceChange,
  onSpeedChange,
}) => {
  const hasSegments = segmentCount > 0
  const isActive = status === 'playing' || status === 'loading'
  const actionLabel = status === 'loading'
    ? '取消生成'
    : isActive
      ? '暂停朗读'
      : '开始朗读'
  const progress = hasSegments ? ((currentIndex + 1) / segmentCount) * 100 : 0

  return (
    <section className="tts-player" aria-label="语音朗读">
      <div className="tts-player-main">
        <div className="tts-player-brand">
          <span className={`tts-engine-dot ${engine === 'mimo' ? 'is-mimo' : 'is-browser'}`} />
          <span className="tts-engine-name">{engine === 'mimo' ? 'MiMo 朗读' : '浏览器朗读'}</span>
          {fallbackReason && <span className="tts-error" title={fallbackReason}>已降级</span>}
          {error && <span className="tts-error is-failure" title={error}>失败</span>}
        </div>

        <div className="tts-controls">
          <button className="tts-icon-btn" onClick={onPrevious} disabled={!hasSegments} title="上一段" aria-label="上一段">
            <Icon><path d="M19 20 9 12l10-8v16ZM5 19V5" /></Icon>
          </button>
          <button className={`tts-play-btn ${isActive ? 'is-playing' : ''}`} onClick={onToggle} disabled={!hasSegments} title={actionLabel} aria-label={actionLabel}>
            {status === 'loading' ? (
              <span className="tts-spinner" />
            ) : isActive ? (
              <Icon><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Icon>
            ) : (
              <Icon><path d="m8 5 11 7-11 7V5Z" /></Icon>
            )}
          </button>
          <button className="tts-icon-btn" onClick={onNext} disabled={!hasSegments} title="下一段" aria-label="下一段">
            <Icon><path d="m5 4 10 8-10 8V4Zm14 1v14" /></Icon>
          </button>
        </div>

        <div className="tts-progress-wrap">
          <div className="tts-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <span className="tts-progress-label">{hasSegments ? `${currentIndex + 1} / ${segmentCount}` : '准备中'}</span>
        </div>

        <div className="tts-options">
          <select
            className="tts-engine-select"
            value={settings.ttsEngine}
            onChange={(event) => onEngineChange(event.target.value as TtsEngine)}
            title="朗读引擎"
            aria-label="朗读引擎"
          >
            <option value="browser">Web Speech（默认）</option>
            <option value="mimo">小米 MiMo-V2.5-TTS</option>
          </select>
          {settings.ttsEngine === 'mimo' && (
            <select className="tts-voice-select" value={settings.ttsVoice} onChange={(event) => onVoiceChange(event.target.value)} title="MiMo 音色" aria-label="MiMo 音色">
              {VOICES.map((voice) => <option value={voice.value} key={voice.value}>{voice.label}</option>)}
            </select>
          )}
          <select value={String(settings.ttsSpeed)} onChange={(event) => onSpeedChange(Number(event.target.value))} title="朗读速度" aria-label="朗读速度">
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => <option value={speed} key={speed}>{speed}x</option>)}
          </select>
        </div>
      </div>
      {fallbackReason && (
        <p className="tts-error-detail" title={fallbackReason}>MiMo 暂不可用，本轮已切换浏览器朗读</p>
      )}
      {error && <p className="tts-error-detail is-failure" title={error}>{error}</p>}
    </section>
  )
}

export default TtsPlayer
