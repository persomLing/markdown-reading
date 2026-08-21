export interface TtsSegment {
  text: string
  element: HTMLElement
}

const MAX_SEGMENT_CHARS = 180
const STRONG_BOUNDARIES = '。！？!?；;\n'
const SOFT_BOUNDARIES = '，,、：: '
const SKIP_SELECTOR = [
  'pre',
  'code',
  '.code-block',
  '.mermaid',
  '.plantuml',
  '.katex',
  '.footnotes',
  'button',
  'input',
  'textarea',
  'svg',
  'script',
  'style',
  '[aria-hidden="true"]',
  '[hidden]',
].join(',')

const normalizeSpeechText = (value: string) => value
  .replace(/https?:\/\/\S+|www\.\S+/gi, '')
  .replace(/\s+/g, ' ')
  .replace(/\s+([，。！？；：、,.!?;:])/g, '$1')
  .trim()

const findBoundary = (text: string, boundaries: string) => {
  let best = -1
  for (const boundary of boundaries) {
    best = Math.max(best, text.lastIndexOf(boundary))
  }
  return best >= 0 ? best + 1 : -1
}

export const splitSpeechText = (value: string, maxChars = MAX_SEGMENT_CHARS) => {
  const text = normalizeSpeechText(value)
  if (!text) return []

  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxChars) {
    const sample = remaining.slice(0, maxChars + 1)
    const minimum = Math.floor(maxChars * 0.45)
    let splitAt = findBoundary(sample, STRONG_BOUNDARIES)
    if (splitAt < minimum) splitAt = findBoundary(sample, SOFT_BOUNDARIES)
    if (splitAt < minimum) splitAt = maxChars

    const chunk = remaining.slice(0, splitAt).trim()
    if (chunk) chunks.push(chunk)
    remaining = remaining.slice(splitAt).trim()
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

const cloneReadableElement = (element: HTMLElement) => {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll(`${SKIP_SELECTOR}, ul, ol, table`).forEach((node) => node.remove())
  return clone
}

const getTableRowText = (row: HTMLTableRowElement) => {
  const cells = Array.from(row.cells)
    .map((cell) => normalizeSpeechText(cell.textContent || ''))
    .filter(Boolean)
  return cells.join('，')
}

const getElementText = (element: HTMLElement) => {
  if (element instanceof HTMLTableRowElement) return getTableRowText(element)
  return normalizeSpeechText(cloneReadableElement(element).textContent || '')
}

const isReadable = (element: HTMLElement) => {
  if (element.matches(SKIP_SELECTOR) || element.closest(SKIP_SELECTOR)) return false
  if (element.closest('details:not([open])') && element.tagName !== 'SUMMARY') return false
  if (element.tagName === 'P' && element.closest('li, td, th')) return false
  if (element.tagName === 'LI' && element.parentElement?.closest('li')) return true
  if (element.tagName === 'TR' && !(element as HTMLTableRowElement).cells.length) return false
  return true
}

export const clearTtsSegmentMarkers = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>('[data-tts-segment]').forEach((element) => {
    element.removeAttribute('data-tts-segment')
    element.classList.remove('tts-speaking')
  })
}

export const extractTtsSegments = (root: HTMLElement): TtsSegment[] => {
  clearTtsSegmentMarkers(root)
  const candidates = root.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, h5, h6, p, li, tr, figcaption, summary'
  )
  const segments: TtsSegment[] = []

  candidates.forEach((element) => {
    if (!isReadable(element)) return
    const text = getElementText(element)
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return

    const firstIndex = segments.length
    splitSpeechText(text).forEach((chunk) => segments.push({ text: chunk, element }))
    if (segments.length > firstIndex) element.dataset.ttsSegment = String(firstIndex)
  })

  return segments
}
