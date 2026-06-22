import type { FileSource } from './types'

// 构建时把 Daily-Reading 下的 md 打包进来作为内置阅读源（支持子目录）
const modules = import.meta.glob('../Daily-Reading/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export interface BuiltinFile {
  name: string
  path: string  // 相对于 Daily-Reading 的路径，如 "AI/AI数据技术科普.md"
  content: string
  size: number
}

export const BUILTIN_FILES: BuiltinFile[] = Object.keys(modules)
  .map((p) => {
    const content = (modules as Record<string, string>)[p]
    // 提取相对于 Daily-Reading 的路径
    const match = p.match(/\.\.\/Daily-Reading\/(.+)/)
    const relativePath = match ? match[1] : p.split('/').pop() || ''
    const name = relativePath.split('/').pop() || ''
    return { name, path: relativePath, content, size: new Blob([content]).size }
  })
  .sort((a, b) => a.path.localeCompare(b.path))

export const BUILTIN_SOURCE_ID = 'builtin-daily-reading'
export const BUILTIN_SOURCE: FileSource = {
  id: BUILTIN_SOURCE_ID,
  type: 'builtin',
  name: '每日精读',
}

export function isBuiltinActive(activeSourceId: string | null): boolean {
  return activeSourceId === BUILTIN_SOURCE_ID
}
