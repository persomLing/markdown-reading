import type { FileSource } from './types'

// 构建时把 Daily-Reading 下的 md 打包进来作为内置阅读源
const modules = import.meta.glob('../Daily-Reading/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export interface BuiltinFile {
  name: string
  content: string
  size: number
}

export const BUILTIN_FILES: BuiltinFile[] = Object.keys(modules)
  .map((p) => {
    const content = (modules as Record<string, string>)[p]
    const name = p.split('/').pop() || ''
    return { name, content, size: new Blob([content]).size }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export const BUILTIN_SOURCE_ID = 'builtin-daily-reading'
export const BUILTIN_SOURCE: FileSource = {
  id: BUILTIN_SOURCE_ID,
  type: 'builtin',
  name: '每日精读',
}

export function isBuiltinActive(activeSourceId: string | null): boolean {
  return activeSourceId === BUILTIN_SOURCE_ID
}
