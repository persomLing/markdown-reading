import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  createBrowserSpeechPlayback,
  createTtsPlayback,
  type TtsEngine,
  type TtsPlayback,
} from '../lib/tts'
import { clearTtsSegmentMarkers, extractTtsSegments, type TtsSegment } from '../lib/tts-text'

type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface UseTtsReaderOptions {
  contentRef: RefObject<HTMLDivElement>
  documentKey: string
  renderRevision: number
  preferredEngine: TtsEngine
  apiKey?: string
  voice: string
  speed: number
  stylePrompt: string
  autoScroll: boolean
}

const getPositionKey = (documentKey: string) => `tts-position-${documentKey}`

export const useTtsReader = ({
  contentRef,
  documentKey,
  renderRevision,
  preferredEngine,
  apiKey,
  voice,
  speed,
  stylePrompt,
  autoScroll,
}: UseTtsReaderOptions) => {
  const [segments, setSegments] = useState<TtsSegment[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [status, setStatus] = useState<TtsStatus>('idle')
  const [engine, setEngine] = useState<TtsEngine>(preferredEngine)
  const [error, setError] = useState('')
  const [fallbackReason, setFallbackReason] = useState('')

  const playbackRef = useRef<TtsPlayback | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  const wantsPlaybackRef = useRef(false)
  const currentIndexRef = useRef(0)
  const highlightedElementRef = useRef<HTMLElement | null>(null)
  const sessionEngineRef = useRef<TtsEngine>(preferredEngine)
  const settingsRef = useRef({ preferredEngine, apiKey, voice, speed, stylePrompt, autoScroll })

  settingsRef.current = { preferredEngine, apiKey, voice, speed, stylePrompt, autoScroll }

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  const clearHighlight = useCallback(() => {
    highlightedElementRef.current?.classList.remove('tts-speaking')
    highlightedElementRef.current = null
  }, [])

  const stopActivePlayback = useCallback(() => {
    runIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    playbackRef.current?.stop()
    playbackRef.current = null
  }, [])

  const focusSegment = useCallback((index: number, segmentList = segments) => {
    if (!segmentList.length) return
    const nextIndex = Math.min(segmentList.length - 1, Math.max(0, index))
    const segment = segmentList[nextIndex]

    clearHighlight()
    segment.element.classList.add('tts-speaking')
    highlightedElementRef.current = segment.element
    currentIndexRef.current = nextIndex
    setCurrentIndex(nextIndex)
    localStorage.setItem(getPositionKey(documentKey), String(nextIndex))

    if (settingsRef.current.autoScroll) {
      segment.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [clearHighlight, documentKey, segments])

  const playAt = useCallback(async function playSegment(
    index: number,
    resetEngine = false,
  ): Promise<void> {
    if (!segments.length || index < 0 || index >= segments.length) {
      wantsPlaybackRef.current = false
      clearHighlight()
      setStatus('idle')
      return
    }

    stopActivePlayback()
    if (resetEngine) {
      sessionEngineRef.current = settingsRef.current.preferredEngine
      setEngine(settingsRef.current.preferredEngine)
      setFallbackReason('')
    }
    wantsPlaybackRef.current = true
    focusSegment(index)
    setError('')
    setStatus('loading')

    const controller = new AbortController()
    abortRef.current = controller
    const runId = runIdRef.current

    try {
      const currentSettings = settingsRef.current
      const request = {
        text: segments[index].text,
        apiKey: currentSettings.apiKey,
        voice: currentSettings.voice,
        stylePrompt: currentSettings.stylePrompt,
        speed: currentSettings.speed,
        signal: controller.signal,
      }
      const playback = sessionEngineRef.current === 'browser'
        ? createBrowserSpeechPlayback(request)
        : await createTtsPlayback({ ...request, fallbackToBrowser: true })

      if (controller.signal.aborted || runId !== runIdRef.current || !wantsPlaybackRef.current) {
        playback.stop()
        return
      }

      playbackRef.current = playback
      sessionEngineRef.current = playback.engine
      setEngine(playback.engine)
      if (playback.fallbackReason) setFallbackReason(playback.fallbackReason)
      setStatus('playing')
      await playback.play()
      const reason = await playback.finished

      if (reason !== 'ended' || runId !== runIdRef.current || !wantsPlaybackRef.current) return
      playbackRef.current = null

      const nextIndex = index + 1
      if (nextIndex < segments.length) {
        void playSegment(nextIndex)
      } else {
        wantsPlaybackRef.current = false
        clearHighlight()
        setStatus('idle')
      }
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === 'AbortError')) return
      playbackRef.current?.stop()
      playbackRef.current = null
      wantsPlaybackRef.current = false
      clearHighlight()
      const message = caught instanceof Error ? caught.message : '语音朗读失败'
      setError(message)
      setStatus('error')
    }
  }, [clearHighlight, focusSegment, segments, stopActivePlayback])

  const togglePlayback = useCallback(() => {
    if (status === 'playing' || status === 'loading') {
      wantsPlaybackRef.current = false
      if (status === 'loading') {
        stopActivePlayback()
      } else {
        playbackRef.current?.pause()
      }
      setStatus('paused')
      return
    }

    wantsPlaybackRef.current = true
    if (status === 'paused' && playbackRef.current) {
      const playback = playbackRef.current
      const runId = runIdRef.current
      setStatus('playing')
      void playback.resume().catch((caught) => {
        if (playbackRef.current !== playback || runId !== runIdRef.current) return
        playback.stop()
        playbackRef.current = null
        wantsPlaybackRef.current = false
        clearHighlight()
        const message = caught instanceof Error ? caught.message : '无法继续播放'
        setError(message)
        setStatus('error')
      })
      return
    }

    void playAt(currentIndexRef.current, status === 'idle' || status === 'error')
  }, [clearHighlight, playAt, status, stopActivePlayback])

  const move = useCallback((direction: -1 | 1) => {
    if (!segments.length) return
    const shouldContinue = status === 'playing' || status === 'loading'
    wantsPlaybackRef.current = false
    stopActivePlayback()
    const nextIndex = Math.min(
      segments.length - 1,
      Math.max(0, currentIndexRef.current + direction),
    )
    focusSegment(nextIndex)
    setStatus(shouldContinue ? 'loading' : 'paused')
    if (shouldContinue) void playAt(nextIndex)
  }, [focusSegment, playAt, segments.length, status, stopActivePlayback])

  const stop = useCallback(() => {
    wantsPlaybackRef.current = false
    stopActivePlayback()
    clearHighlight()
    sessionEngineRef.current = settingsRef.current.preferredEngine
    setEngine(settingsRef.current.preferredEngine)
    setFallbackReason('')
    setError('')
    setStatus('idle')
  }, [clearHighlight, stopActivePlayback])

  useEffect(() => {
    playbackRef.current?.setRate(speed)
  }, [speed])

  useEffect(() => {
    wantsPlaybackRef.current = false
    stopActivePlayback()
    clearHighlight()
    setError('')
    setFallbackReason('')
    sessionEngineRef.current = preferredEngine
    setEngine(preferredEngine)
    setStatus('idle')
  }, [clearHighlight, preferredEngine, stopActivePlayback])

  useEffect(() => {
    wantsPlaybackRef.current = false
    stopActivePlayback()
    clearHighlight()
    setError('')
    setFallbackReason('')
    setEngine(settingsRef.current.preferredEngine)
    sessionEngineRef.current = settingsRef.current.preferredEngine
    setStatus('idle')

    const root = contentRef.current
    if (!root || renderRevision === 0) {
      setSegments([])
      setCurrentIndex(0)
      return
    }

    const nextSegments = extractTtsSegments(root)
    const savedPosition = Number.parseInt(localStorage.getItem(getPositionKey(documentKey)) || '0', 10)
    const nextIndex = Number.isFinite(savedPosition)
      ? Math.min(Math.max(savedPosition, 0), Math.max(0, nextSegments.length - 1))
      : 0

    setSegments(nextSegments)
    setCurrentIndex(nextIndex)
    currentIndexRef.current = nextIndex
  }, [clearHighlight, contentRef, documentKey, renderRevision, stopActivePlayback])

  useEffect(() => () => {
    wantsPlaybackRef.current = false
    stopActivePlayback()
    clearHighlight()
    const root = contentRef.current
    if (root) clearTtsSegmentMarkers(root)
  }, [clearHighlight, contentRef, stopActivePlayback])

  return {
    status,
    engine,
    error,
    fallbackReason,
    currentIndex,
    segmentCount: segments.length,
    currentText: segments[currentIndex]?.text || '',
    togglePlayback,
    previous: () => move(-1),
    next: () => move(1),
    stop,
  }
}
