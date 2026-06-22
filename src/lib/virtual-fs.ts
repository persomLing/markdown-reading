/**
 * 虚拟文件系统：把 <input webkitdirectory> 读到的 FileList
 * 封装成类 FileSystemDirectoryHandle 接口，让 store 的目录遍历逻辑无需修改即可复用。
 *
 * 仅当浏览器不支持 showDirectoryPicker（移动端/非 Chromium）时使用。
 */

// 虚拟目录条目：记录子目录和文件
interface VDir {
  kind: 'directory'
  name: string
  children: Map<string, VDir>
  files: Map<string, File>
}

export class VirtualDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const
  readonly name: string
  private _dir: VDir

  constructor(dir: VDir) {
    this._dir = dir
    this.name = dir.name
  }

  // 遍历当前目录的 entries
  async *entries(): AsyncIterableIterator<[string, VirtualDirectoryHandle | VirtualFileHandle]> {
    // 先输出子目录
    for (const [name, child] of this._dir.children) {
      yield [name, new VirtualDirectoryHandle(child)]
    }
    // 再输出文件
    for (const [name, file] of this._dir.files) {
      yield [name, new VirtualFileHandle(name, file)]
    }
  }

  async getDirectoryHandle(name: string): Promise<VirtualDirectoryHandle> {
    const child = this._dir.children.get(name)
    if (!child) throw new DOMException('NotFoundError', 'NotFoundError')
    return new VirtualDirectoryHandle(child)
  }

  async getFileHandle(name: string): Promise<VirtualFileHandle> {
    const file = this._dir.files.get(name)
    if (!file) throw new DOMException('NotFoundError', 'NotFoundError')
    return new VirtualFileHandle(name, file)
  }

  // 以下方法为接口完整性，本应用不使用
  async *keys(): AsyncIterableIterator<string> { for await (const [k] of this.entries()) yield k }
  async *values(): AsyncIterableIterator<any> { for await (const [, v] of this.entries()) yield v }
  async *[Symbol.asyncIterator]() { yield* this.entries() }
  async removeEntry() {}
  async resolve() { return [] }
  async queryPermission(): Promise<PermissionState> { return 'granted' }
  async requestPermission(): Promise<PermissionState> { return 'granted' }
  async isSameEntry(): Promise<boolean> { return false }
  async getUniqueId(): Promise<string> { return '' }
  readonly [Symbol.toStringTag] = 'FileSystemDirectoryHandle'
}

export class VirtualFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const
  readonly name: string
  private _file: File

  constructor(name: string, file: File) {
    this.name = name
    this._file = file
  }

  async getFile(): Promise<File> {
    return this._file
  }

  async createWritable(): Promise<any> {
    throw new Error('Not supported')
  }

  async *keys(): AsyncIterableIterator<string> {}
  async *values(): AsyncIterableIterator<any> {}
  async *[Symbol.asyncIterator]() {}
  async resolve() { return [] }
  async queryPermission(): Promise<PermissionState> { return 'granted' }
  async requestPermission(): Promise<PermissionState> { return 'granted' }
  async isSameEntry(): Promise<boolean> { return false }
  async getUniqueId(): Promise<string> { return '' }
  readonly [Symbol.toStringTag] = 'FileSystemFileHandle'
}

/**
 * 从 webkitdirectory input 的 FileList 构建虚拟目录树
 * 每个 File 的 webkitRelativePath 格式: "root/subdir/file.md"
 */
export function buildVirtualFS(files: FileList | File[]): VirtualDirectoryHandle {
  const root: VDir = { kind: 'directory', name: '', children: new Map(), files: new Map() }

  for (const file of Array.from(files)) {
    const relPath = (file as any).webkitRelativePath || file.name
    const parts = relPath.split('/')

    let current = root
    // 如果第一段就是根文件夹名，把它设为 root.name
    if (parts.length > 1 && !root.name) {
      root.name = parts[0]
    }

    // 遍历中间目录（跳过第一段，因为它已经是 root.name）
    const startIndex = parts.length > 1 && root.name === parts[0] ? 1 : 0
    for (let i = startIndex; i < parts.length - 1; i++) {
      const dirName = parts[i]
      if (!current.children.has(dirName)) {
        current.children.set(dirName, { kind: 'directory', name: dirName, children: new Map(), files: new Map() })
      }
      current = current.children.get(dirName)!
    }

    // 最后一段是文件名
    const fileName = parts[parts.length - 1]
    current.files.set(fileName, file)
  }

  return new VirtualDirectoryHandle(root)
}

/**
 * 检测是否真正支持原生 File System Access API
 * 安卓 Chrome 即使 API 存在也不可用，需排除移动端
 */
export function supportsNativeFS(): boolean {
  if (!('showDirectoryPicker' in window)) return false
  // 排除移动端（安卓 Chrome/iOS Safari 都不支持 showDirectoryPicker 实际调用）
  const ua = navigator.userAgent || ''
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Android/i.test(ua)
  if (isMobile) return false
  // 进一步检测触屏（部分 Windows 触屏设备也可能有问题）
  if (navigator.maxTouchPoints > 1 && /Mobi|Tablet/i.test(ua)) return false
  return true
}

/**
 * 尝试调用 showDirectoryPicker，失败抛错由调用方降级
 * 安卓等环境即使 API 存在也会抛 NotSupportedError
 */
export async function tryShowDirectoryPicker(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    return handle as FileSystemDirectoryHandle
  } catch (e) {
    // 用户取消抛 AbortError，其他错误由调用方处理
    throw e
  }
}
