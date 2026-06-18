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
