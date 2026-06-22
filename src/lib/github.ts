import { GitHubRepoInfo, GitHubEntry } from '../types'

/**
 * 解析 GitHub URL，提取 owner / repo / branch / subdir
 * 支持格式：
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   https://github.com/owner/repo/tree/branch/subdir
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string; subdir?: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/)
  if (!match) return null

  const owner = match[1]
  let repo = match[2]
  // 去掉可能的 .git 后缀
  repo = repo.replace(/\.git$/, '')
  const branch = match[3] || undefined
  const subdir = match[4] || undefined

  return { owner, repo, branch, subdir }
}

/** 构建请求头，有 token 则附加 Authorization */
function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** 获取仓库默认分支名 */
export async function fetchDefaultBranch(owner: string, repo: string, token?: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: authHeaders(token) })
  if (!res.ok) {
    if (res.status === 404) throw new Error('仓库不存在或为私有仓库')
    if (res.status === 403) throw new Error('API 速率限制，请稍后再试或填入 GitHub Token')
    throw new Error(`获取仓库信息失败 (${res.status})`)
  }
  const data = await res.json()
  return data.default_branch || 'main'
}

/** 获取仓库目录内容，只返回 md/markdown/txt 文件和目录 */
export async function fetchRepoContents(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token?: string
): Promise<GitHubEntry[]> {
  const cleanPath = path.replace(/^\/+|\/+$/g, '')
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`
  const res = await fetch(url, { headers: authHeaders(token) })
  if (!res.ok) {
    if (res.status === 404) throw new Error('目录不存在')
    if (res.status === 403) throw new Error('API 速率限制，请稍后再试或填入 GitHub Token')
    throw new Error(`获取目录内容失败 (${res.status})`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) return []

  const entries: GitHubEntry[] = data
    .filter((item: any) => {
      if (item.type === 'dir') return true
      if (item.type === 'file') return /\.(md|markdown|txt)$/i.test(item.name)
      return false
    })
    .map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size || 0,
    }))

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

/** 通过 raw.githubusercontent.com 获取文件内容 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`文件获取失败 (${res.status})`)
  }
  return res.text()
}

/** 从 repoUrl 中解析出 GitHubRepoInfo（含默认分支获取） */
export async function resolveGitHubRepo(repoUrl: string, token?: string): Promise<GitHubRepoInfo | null> {
  const parsed = parseGitHubUrl(repoUrl)
  if (!parsed) return null

  const branch = parsed.branch || await fetchDefaultBranch(parsed.owner, parsed.repo, token)
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
    subdir: parsed.subdir,
  }
}
