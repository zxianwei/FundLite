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

      request.onsuccess = async () => {
        const value = request.result
        if (!Array.isArray(value) || value.length === 0) {
          // IndexedDB 可能被系统清理（如 iOS Safari），此时查 localStorage 捡回数据
          const fallback = readFromLocalStorage()
          if (fallback.length > 0) {
            // 捡回成功，同步写回 IndexedDB 修复存储
            try {
              const writeTx = db.transaction(STORE_NAME, 'readwrite')
              writeTx.objectStore(STORE_NAME).put(fallback, WATCHLIST_KEY)
            } catch { /* localStorage 兜底仍在，不阻塞返回 */ }
            resolve(fallback)
            return
          }
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

// 导出数据为 JSON 字符串
export function exportWatchlist(funds: StoredFund[]): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    funds: funds,
  }
  return JSON.stringify(data, null, 2)
}

// 验证导入的数据格式
function validateImportedData(data: unknown): StoredFund[] | null {
  if (!data || typeof data !== 'object') return null

  const obj = data as Record<string, unknown>

  // 支持两种格式：
  // 1. { version: 1, funds: [...] }
  // 2. [...] (纯数组格式)

  let funds: unknown[] = []

  if (Array.isArray(obj.funds)) {
    funds = obj.funds
  } else if (Array.isArray(obj)) {
    funds = obj
  } else {
    return null
  }

  const validFunds: StoredFund[] = []

  for (const item of funds) {
    if (!item || typeof item !== 'object') continue

    const fund = item as Record<string, unknown>
    const code = typeof fund.code === 'string' ? fund.code.trim() : ''
    const name = typeof fund.name === 'string' ? fund.name.trim() : ''

    if (code && name) {
      validFunds.push({ code, name })
    }
  }

  return validFunds.length > 0 ? validFunds : null
}

// 从 JSON 字符串导入数据
export function importWatchlist(json: string): { success: boolean; funds?: StoredFund[]; error?: string } {
  try {
    const parsed = JSON.parse(json)
    const funds = validateImportedData(parsed)

    if (!funds) {
      return { success: false, error: '数据格式不正确，未找到有效的基金列表' }
    }

    return { success: true, funds }
  } catch {
    return { success: false, error: 'JSON 解析失败，请检查文件格式' }
  }
}
