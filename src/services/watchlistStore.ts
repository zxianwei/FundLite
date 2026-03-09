export interface StoredFund {
  code: string
  name: string
}

const DB_NAME = 'fundlite-db'
const DB_VERSION = 1
const STORE_NAME = 'app'
const WATCHLIST_KEY = 'watchlist'
const FALLBACK_KEY = 'fundlite.watchlist'

function hasIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      // 当前只存一个简单键值仓库，后续要扩展别的数据也方便升级。
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
  })
}

function readFromLocalStorage() {
  const raw = window.localStorage.getItem(FALLBACK_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as StoredFund[]
    return parsed.filter((item) => item?.code && item?.name)
  } catch {
    return []
  }
}

function writeToLocalStorage(funds: StoredFund[]) {
  window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(funds))
}

export async function loadWatchlist() {
  if (!hasIndexedDb()) {
    return readFromLocalStorage()
  }

  try {
    const db = await openDb()
    const result = await new Promise<StoredFund[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(WATCHLIST_KEY)

      request.onsuccess = () => {
        const value = request.result
        if (!Array.isArray(value)) {
          resolve([])
          return
        }
        resolve(value.filter((item) => item?.code && item?.name))
      }
      request.onerror = () => reject(request.error ?? new Error('读取基金列表失败'))
    })
    db.close()
    return result
  } catch {
    // IndexedDB 异常时回退到 localStorage，保证列表至少可恢复。
    return readFromLocalStorage()
  }
}

export async function saveWatchlist(funds: StoredFund[]) {
  // 先写 fallback，再尝试写 IndexedDB，避免数据库异常导致完全丢数据。
  writeToLocalStorage(funds)

  if (!hasIndexedDb()) return

  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const request = transaction.objectStore(STORE_NAME).put(funds, WATCHLIST_KEY)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('保存基金列表失败'))
    })
    db.close()
  } catch {
    // localStorage fallback has already been written above.
  }
}
