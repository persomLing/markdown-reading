import type { TtsEngine } from '../types'

export const DEFAULT_TTS_VOICE = '冰糖'

const DEFAULT_TTS_ENDPOINT = '/api/tts'

export type { TtsEngine }
export type TtsCompletionReason = 'ended' | 'stopped'

export interface TtsRequest {
  text: string
  apiKey?: string
  voice?: string
  stylePrompt?: string
  speed?: number
  signal?: AbortSignal
}

export interface CreateTtsPlaybackOptions extends TtsRequest {
  fallbackToBrowser?: boolean
}

export interface TtsPlayback {
  readonly engine: TtsEngine
  readonly fallbackReason?: string
  readonly finished: Promise<TtsCompletionReason>
  play: () => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  stop: () => void
  setRate: (rate: number) => void
}

interface TtsErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

export class TtsClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'TtsClientError'
  }
}

const clampRate = (rate?: number) => {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return 1
  return Math.min(2, Math.max(0.5, rate))
}

const getTtsEndpoint = () => {
  const configured = import.meta.env.VITE_TTS_ENDPOINT?.trim()
  return configured || DEFAULT_TTS_ENDPOINT
}

const isTrustedClientKeyEndpoint = (endpoint: string) => {
  if (typeof window === 'undefined') return false
  try {
    const url = new URL(endpoint, window.location.href)
    return url.origin === window.location.origin && url.pathname === '/api/tts'
  } catch {
    return false
  }
}

const getErrorPayload = async (response: Response) => {
  try {
    return await response.json() as TtsErrorPayload
  } catch {
    return null
  }
}

export const synthesizeMiMoSpeech = async ({
  text,
  apiKey,
  voice = DEFAULT_TTS_VOICE,
  stylePrompt,
  speed = 1,
  signal,
}: TtsRequest): Promise<Blob> => {
  const normalizedText = text.trim()
  if (!normalizedText) {
    throw new TtsClientError('待朗读文本不能为空', 'EMPTY_TEXT', 400)
  }

  let response: Response
  try {
    const localApiKey = apiKey?.trim()
    const endpoint = getTtsEndpoint()
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localApiKey && isTrustedClientKeyEndpoint(endpoint)
          ? { 'X-MiMo-API-Key': localApiKey }
          : {}),
      },
      body: JSON.stringify({
        text: normalizedText,
        voice,
        style_prompt: stylePrompt?.trim() || undefined,
        speed: clampRate(speed),
      }),
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new TtsClientError('无法连接语音服务', 'TTS_UNAVAILABLE')
  }

  if (!response.ok) {
    const payload = await getErrorPayload(response)
    throw new TtsClientError(
      payload?.error?.message || `语音生成失败 (${response.status})`,
      payload?.error?.code || 'TTS_REQUEST_FAILED',
      response.status,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('audio/')) {
    throw new TtsClientError('语音服务未返回音频', 'TTS_INVALID_RESPONSE', response.status)
  }

  const audio = await response.blob()
  if (audio.size === 0) {
    throw new TtsClientError('语音服务返回了空音频', 'TTS_EMPTY_AUDIO', response.status)
  }
  return audio
}

// Keep the common spelling available to callers while retaining the vendor's
// `MiMo` capitalization in the primary implementation name.
export const synthesizeMimoSpeech = synthesizeMiMoSpeech

const attachAbortSignal = (playback: TtsPlayback, signal?: AbortSignal) => {
  if (!signal) return playback
  if (signal.aborted) {
    playback.stop()
    return playback
  }

  const stop = () => playback.stop()
  signal.addEventListener('abort', stop, { once: true })
  void playback.finished.then(
    () => signal.removeEventListener('abort', stop),
    () => signal.removeEventListener('abort', stop),
  )
  return playback
}

const createAudioPlayback = (blob: Blob, initialRate: number): TtsPlayback => {
  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio(objectUrl)
  audio.preload = 'auto'
  audio.playbackRate = clampRate(initialRate)

  let settled = false
  let resolveFinished: (reason: TtsCompletionReason) => void = () => undefined
  let rejectFinished: (error: Error) => void = () => undefined
  const finished = new Promise<TtsCompletionReason>((resolve, reject) => {
    resolveFinished = resolve
    rejectFinished = reject
  })

  const cleanup = () => {
    audio.removeEventListener('ended', handleEnded)
    audio.removeEventListener('error', handleError)
    URL.revokeObjectURL(objectUrl)
  }
  const settle = (reason: TtsCompletionReason) => {
    if (settled) return
    settled = true
    cleanup()
    resolveFinished(reason)
  }
  const handleEnded = () => settle('ended')
  const handleError = () => {
    if (settled) return
    settled = true
    cleanup()
    rejectFinished(new TtsClientError('音频播放失败', 'AUDIO_PLAYBACK_FAILED'))
  }

  audio.addEventListener('ended', handleEnded)
  audio.addEventListener('error', handleError)

  return {
    engine: 'mimo',
    finished,
    play: () => audio.play(),
    pause: () => audio.pause(),
    resume: () => audio.play(),
    stop: () => {
      audio.pause()
      audio.currentTime = 0
      settle('stopped')
    },
    setRate: (rate) => {
      audio.playbackRate = clampRate(rate)
    },
  }
}

export const isBrowserSpeechAvailable = () => (
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window
)

const findBrowserVoice = (preferredVoice?: string) => {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((voice) => voice.name === preferredVoice)
    || voices.find((voice) => /^zh(?:-|_)/i.test(voice.lang))
}

export const createBrowserSpeechPlayback = (request: TtsRequest): TtsPlayback => {
  if (!isBrowserSpeechAvailable()) {
    throw new TtsClientError('当前浏览器不支持语音朗读', 'BROWSER_SPEECH_UNAVAILABLE')
  }

  const utterance = new SpeechSynthesisUtterance(request.text.trim())
  const speech = window.speechSynthesis
  const voice = findBrowserVoice(request.voice)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang || 'zh-CN'
  utterance.rate = clampRate(request.speed)

  let started = false
  let settled = false
  let resolveFinished: (reason: TtsCompletionReason) => void = () => undefined
  let rejectFinished: (error: Error) => void = () => undefined
  const finished = new Promise<TtsCompletionReason>((resolve, reject) => {
    resolveFinished = resolve
    rejectFinished = reject
  })

  const cleanup = () => {
    utterance.onend = null
    utterance.onerror = null
  }
  const settle = (reason: TtsCompletionReason) => {
    if (settled) return
    settled = true
    cleanup()
    resolveFinished(reason)
  }

  utterance.onend = () => settle('ended')
  utterance.onerror = () => {
    if (settled) return
    settled = true
    cleanup()
    rejectFinished(new TtsClientError('浏览器语音朗读失败', 'BROWSER_SPEECH_FAILED'))
  }

  const playback: TtsPlayback = {
    engine: 'browser',
    finished,
    play: async () => {
      if (settled) return
      if (started) {
        if (speech.paused) speech.resume()
        return
      }
      started = true
      speech.speak(utterance)
    },
    pause: () => {
      if (started && !settled) speech.pause()
    },
    resume: async () => {
      if (!started) {
        started = true
        speech.speak(utterance)
      } else if (!settled) {
        speech.resume()
      }
    },
    stop: () => {
      if (settled) return
      settle('stopped')
      if (started) speech.cancel()
    },
    setRate: (rate) => {
      if (!started) utterance.rate = clampRate(rate)
    },
  }

  return attachAbortSignal(playback, request.signal)
}

export const createTtsPlayback = async ({
  fallbackToBrowser = true,
  ...request
}: CreateTtsPlaybackOptions): Promise<TtsPlayback> => {
  try {
    const blob = await synthesizeMiMoSpeech(request)
    return attachAbortSignal(createAudioPlayback(blob, request.speed ?? 1), request.signal)
  } catch (error) {
    if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error
    }
    if (!fallbackToBrowser || !isBrowserSpeechAvailable()) {
      throw error
    }
    const playback = createBrowserSpeechPlayback(request)
    return {
      ...playback,
      fallbackReason: error instanceof Error ? error.message : 'MiMo 语音暂不可用',
    }
  }
}
