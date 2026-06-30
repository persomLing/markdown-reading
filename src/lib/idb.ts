// IndexedDB 工具：持久化 FileSystemDirectoryHandle，实现本地源的免重选切换
const DB_NAME = 'mr-handles'
const STORE = 'handles'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB()
  const result = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

export async function deleteHandle(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

// 检查/请求目录权限，返回是否已授权
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  readWrite = false
): Promise<boolean> {
  const opts: any = { mode: readWrite ? 'readwrite' : 'read' }
  const h = handle as any
  if ((await h.queryPermission?.(opts)) === 'granted') return true
  if ((await h.requestPermission?.(opts)) === 'granted') return true
  return false
}

// ==================== 虚拟文件系统持久化 ====================
// 用于降级方案（<input> 选择的文件夹），将目录结构和文件内容序列化存入 IndexedDB
const VFS_STORE = 'vfs'

function openVFSDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME + '-vfs', 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(VFS_STORE)) {
        req.result.createObjectStore(VFS_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

interface SerializedFile {
  name: string
  content: string
  size: number
}

interface SerializedDir {
  name: string
  children: SerializedDir[]
  files: SerializedFile[]
}

// 从 VirtualDirectoryHandle 递归序列化为可存储的 JSON
async function serializeVFS(handle: any): Promise<SerializedDir> {
  const dir: SerializedDir = { name: handle.name, children: [], files: [] }
  try {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'directory') {
        dir.children.push(await serializeVFS(entry))
      } else if (entry.kind === 'file') {
        if (!/\.(md|markdown|txt)$/i.test(name)) continue
        try {
          const file = await entry.getFile()
          const content = await file.text()
          dir.files.push({ name, content, size: file.size })
        } catch (e) {
          console.warn(`跳过无法读取的文件: ${name}`, e)
        }
      }
    }
  } catch (e) {
    console.warn('序列化 VFS 目录失败:', e)
  }
  return dir
}

export async function saveVirtualFS(id: string, handle: any): Promise<void> {
  const data = await serializeVFS(handle)
  const db = await openVFSDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VFS_STORE, 'readwrite')
      tx.objectStore(VFS_STORE).put(data, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function restoreVirtualFS(id: string): Promise<SerializedDir | null> {
  const db = await openVFSDB()
  try {
    return await new Promise<SerializedDir | null>((resolve, reject) => {
      const tx = db.transaction(VFS_STORE, 'readonly')
      const req = tx.objectStore(VFS_STORE).get(id)
      req.onsuccess = () => resolve((req.result as SerializedDir) || null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function deleteVirtualFS(id: string): Promise<void> {
  const db = await openVFSDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VFS_STORE, 'readwrite')
      tx.objectStore(VFS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
