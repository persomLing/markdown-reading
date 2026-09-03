import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1'
const DEFAULT_MIMO_TTS_MODEL = 'mimo-v2.5-tts'
const DEFAULT_MIMO_TTS_VOICE = '冰糖'
const MAX_REQUEST_BODY_LENGTH = 20_000
const MAX_TEXT_LENGTH = 10_000

interface TtsRequestBody {
  text?: unknown
  voice?: unknown
  style_prompt?: unknown
  stylePrompt?: unknown
  speed?: unknown
}

interface MiMoTtsResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string
      }
    }
  }>
  error?: {
    message?: string
  }
  message?: string
}

interface MiddlewareRequest {
  url?: string
  method?: string
  headers?: Record<string, string | string[] | undefined>
  socket?: {
    remoteAddress?: string
  }
  setEncoding: (encoding: string) => void
  on: (event: string, listener: (...args: any[]) => void) => void
}

interface MiddlewareResponse {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string | Uint8Array) => void
}

class TtsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

const sendJson = (
  response: MiddlewareResponse,
  status: number,
  payload: unknown,
) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

const readJsonBody = (request: MiddlewareRequest) => new Promise<TtsRequestBody>((resolve, reject) => {
  let body = ''
  let tooLarge = false

  request.setEncoding('utf8')
  request.on('data', (chunk: string) => {
    if (tooLarge) return
    body += chunk
    if (body.length > MAX_REQUEST_BODY_LENGTH) {
      tooLarge = true
    }
  })
  request.on('end', () => {
    if (tooLarge) {
      reject(new TtsHttpError('请求内容过大', 413, 'REQUEST_TOO_LARGE'))
      return
    }

    try {
      resolve(JSON.parse(body || '{}') as TtsRequestBody)
    } catch {
      reject(new TtsHttpError('请求不是有效的 JSON', 400, 'INVALID_JSON'))
    }
  })
  request.on('error', reject)
})

const decodeBase64Audio = (value: string) => {
  const base64 = value.replace(/^data:audio\/[\w.+-]+;base64,/, '')
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const isWaveAudio = (audio: Uint8Array) => (
  audio.byteLength >= 12 &&
  String.fromCharCode(...audio.slice(0, 4)) === 'RIFF' &&
  String.fromCharCode(...audio.slice(8, 12)) === 'WAVE'
)

const getUpstreamErrorMessage = async (response: Response) => {
  const fallback = `MiMo TTS 请求失败 (${response.status})`

  try {
    const payload = await response.json() as MiMoTtsResponse
    const message = payload.error?.message || payload.message
    return typeof message === 'string' && message.trim()
      ? message.trim().slice(0, 300)
      : fallback
  } catch {
    return fallback
  }
}

const isLoopbackAddress = (address?: string) => (
  address === '127.0.0.1'
  || address === '::1'
  || address === '::ffff:127.0.0.1'
)

const createMiMoTtsPlugin = (env: Record<string, string>, isDevelopment: boolean): Plugin => {
  const apiKey = env.MIMO_API_KEY?.trim()
  const baseUrl = (env.MIMO_BASE_URL?.trim() || DEFAULT_MIMO_BASE_URL).replace(/\/+$/, '')
  const model = env.MIMO_TTS_MODEL?.trim() || DEFAULT_MIMO_TTS_MODEL
  const defaultVoice = env.MIMO_TTS_VOICE?.trim() || DEFAULT_MIMO_TTS_VOICE
  const allowClientApiKey = env.ALLOW_CLIENT_MIMO_KEY?.trim().toLowerCase() === 'true'

  const middleware = (request: MiddlewareRequest, response: MiddlewareResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/api/tts') {
      next()
      return
    }

    void (async () => {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST')
        throw new TtsHttpError('仅支持 POST 请求', 405, 'METHOD_NOT_ALLOWED')
      }

      const apiKeyHeader = request.headers?.['x-mimo-api-key']
      const clientKeyAllowed = allowClientApiKey
        || (isDevelopment && isLoopbackAddress(request.socket?.remoteAddress))
      const localApiKey = clientKeyAllowed
        ? (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader)?.trim()
        : undefined
      if (localApiKey && localApiKey.length > 512) {
        throw new TtsHttpError('MiMo API Key 格式无效', 400, 'INVALID_MIMO_API_KEY')
      }
      const activeApiKey = localApiKey || apiKey

      if (!activeApiKey) {
        throw new TtsHttpError(
          '未配置 MiMo TTS，请在设置中填写 API Key，或在 .env.local 中设置 MIMO_API_KEY',
          503,
          'MIMO_TTS_NOT_CONFIGURED',
        )
      }

      const payload = await readJsonBody(request)
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      if (!text) {
        throw new TtsHttpError('待朗读文本不能为空', 400, 'EMPTY_TEXT')
      }
      if (text.length > MAX_TEXT_LENGTH) {
        throw new TtsHttpError(
          `单次朗读文本不能超过 ${MAX_TEXT_LENGTH} 个字符`,
          413,
          'TEXT_TOO_LONG',
        )
      }

      const voice = typeof payload.voice === 'string' && payload.voice.trim()
        ? payload.voice.trim()
        : defaultVoice
      const rawStylePrompt = payload.style_prompt ?? payload.stylePrompt
      const stylePrompt = typeof rawStylePrompt === 'string' ? rawStylePrompt.trim().slice(0, 500) : ''
      const requestedSpeed = typeof payload.speed === 'number' && Number.isFinite(payload.speed)
        ? Math.min(2, Math.max(0.5, payload.speed))
        : 1

      const messages = [
        ...(stylePrompt ? [{ role: 'user', content: stylePrompt }] : []),
        { role: 'assistant', content: text },
      ]

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)
      let upstream: Response

      try {
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'api-key': activeApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            audio: {
              format: 'wav',
              voice,
            },
          }),
          signal: controller.signal,
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TtsHttpError('MiMo TTS 请求超时', 504, 'MIMO_TTS_TIMEOUT')
        }
        throw new TtsHttpError('无法连接 MiMo TTS 服务', 502, 'MIMO_TTS_UNAVAILABLE')
      } finally {
        clearTimeout(timeout)
      }

      if (!upstream.ok) {
        throw new TtsHttpError(
          await getUpstreamErrorMessage(upstream),
          502,
          'MIMO_TTS_UPSTREAM_ERROR',
        )
      }

      const contentType = upstream.headers.get('content-type') || ''
      let audio: Uint8Array

      if (contentType.startsWith('audio/')) {
        audio = new Uint8Array(await upstream.arrayBuffer())
      } else {
        const result = await upstream.json() as MiMoTtsResponse
        const audioData = result.choices?.[0]?.message?.audio?.data
        if (!audioData) {
          throw new TtsHttpError('MiMo TTS 未返回音频数据', 502, 'MIMO_TTS_EMPTY_AUDIO')
        }

        try {
          audio = decodeBase64Audio(audioData)
        } catch {
          throw new TtsHttpError('MiMo TTS 返回的音频数据无效', 502, 'MIMO_TTS_INVALID_AUDIO')
        }
      }

      if (!isWaveAudio(audio)) {
        throw new TtsHttpError('MiMo TTS 返回的 WAV 音频无效', 502, 'MIMO_TTS_INVALID_AUDIO')
      }

      response.statusCode = 200
      response.setHeader('Content-Type', 'audio/wav')
      response.setHeader('Content-Length', String(audio.byteLength))
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('X-TTS-Engine', 'mimo-v2.5-tts')
      response.setHeader('X-TTS-Requested-Rate', String(requestedSpeed))
      response.end(audio)
    })().catch((error: unknown) => {
      const knownError = error instanceof TtsHttpError
        ? error
        : new TtsHttpError('语音生成失败', 500, 'TTS_INTERNAL_ERROR')
      sendJson(response, knownError.status, {
        error: {
          code: knownError.code,
          message: knownError.message,
        },
      })
    })
  }

  return {
    name: 'mimo-tts-proxy',
    configureServer(server) {
      server.middlewares.use(middleware as never)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware as never)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    base: mode === 'github' ? '/markdown-reading/' : '/',
    plugins: [react(), createMiMoTtsPlugin(env, mode === 'development')],
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: mode === 'github' ? 'docs' : 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('zustand')) {
                return 'vendor-framework'
              }
              if (id.includes('highlight.js')) {
                return 'vendor-highlight'
              }
              if (id.includes('marked') || id.includes('dompurify')) {
                return 'vendor-markdown'
              }
            }
          },
        },
      },
    },
  }
})
