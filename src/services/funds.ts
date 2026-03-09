export interface FundSearchApiItem {
  CODE: string
  NAME: string
  CATEGORY?: number
  CATEGORYDESC?: string
  FundBaseInfo?: {
    DWJZ?: number
    FSRQ?: string
    JJGS?: string
    SHORTNAME?: string
  }
}

interface FundSearchApiResponse {
  ErrCode: number
  ErrMsg?: string
  Datas?: FundSearchApiItem[]
}

export interface FundSearchResult {
  code: string
  name: string
  company: string
  category: string
  nav: number | null
  navDate: string
}

export interface FundEstimate {
  code: string
  name: string
  estimate: number | null
  growth: number | null
  nav: number | null
  navDate: string
  estimateTime: string
}

declare global {
  interface Window {
    jsonpgz?: (payload: FundEstimateApiResponse) => void
    [key: string]: unknown
  }
}

interface FundEstimateApiResponse {
  fundcode: string
  name: string
  dwjz: string
  gsz: string
  gszzl: string
  jzrq: string
  gztime: string
}

const SEARCH_ENDPOINT = 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx'
const ESTIMATE_ENDPOINT = 'https://fundgz.1234567.com.cn/js'

function appendScript(url: string) {
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onerror = () => {
      script.remove()
      reject(new Error('脚本加载失败'))
    }
    script.onload = () => resolve(script)
    document.head.append(script)
  })
}

function cleanupCallback(callbackName: string) {
  try {
    delete window[callbackName]
  } catch {
    window[callbackName] = undefined
  }
}

function loadJsonp<T>(
  url: string,
  callbackName: string,
  callbackParam = 'callback',
  timeout = 8000,
) {
  return new Promise<T>((resolve, reject) => {
    // 搜索和估值接口都走 script 注入，兼容对 CORS 不友好的接口。
    const timer = window.setTimeout(() => {
      cleanupCallback(callbackName)
      reject(new Error('请求超时'))
    }, timeout)

    window[callbackName] = (payload: T) => {
      window.clearTimeout(timer)
      cleanupCallback(callbackName)
      resolve(payload)
    }

    const target = new URL(url)
    target.searchParams.set(callbackParam, callbackName)
    appendScript(target.toString())
      .then((script) => {
        window.setTimeout(() => script.remove(), 0)
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer)
        cleanupCallback(callbackName)
        reject(error instanceof Error ? error : new Error('请求失败'))
      })
  })
}

let estimateQueue = Promise.resolve()

function queueEstimate<T>(task: () => Promise<T>) {
  // 估值接口依赖固定全局回调 jsonpgz，因此串行化请求避免互相覆盖。
  const run = estimateQueue.then(task, task)
  estimateQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function toNumber(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export async function searchFunds(keyword: string) {
  const query = keyword.trim()
  if (!query) return []

  const callbackName = `fundSearchCb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const payload = await loadJsonp<FundSearchApiResponse>(
    `${SEARCH_ENDPOINT}?m=1&key=${encodeURIComponent(query)}`,
    callbackName,
  )

  return (payload.Datas ?? [])
    .filter((item) => item.CATEGORY === 700 && item.CODE)
    .map<FundSearchResult>((item) => ({
      code: item.CODE,
      name: item.NAME,
      company: item.FundBaseInfo?.JJGS ?? '',
      category: item.CATEGORYDESC ?? '基金',
      nav: toNumber(item.FundBaseInfo?.DWJZ),
      navDate: item.FundBaseInfo?.FSRQ ?? '',
    }))
}

async function fetchFundEstimateInternal(code: string) {
  return new Promise<FundEstimate>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.jsonpgz = undefined
      reject(new Error('估值请求超时'))
    }, 8000)

    // 东财估值脚本会直接调用全局 jsonpgz(...)。
    window.jsonpgz = (payload: FundEstimateApiResponse) => {
      window.clearTimeout(timer)
      window.jsonpgz = undefined
      resolve({
        code: payload.fundcode,
        name: payload.name,
        estimate: toNumber(payload.gsz),
        growth: toNumber(payload.gszzl),
        nav: toNumber(payload.dwjz),
        navDate: payload.jzrq,
        estimateTime: payload.gztime,
      })
    }

    appendScript(`${ESTIMATE_ENDPOINT}/${code}.js?rt=${Date.now()}`)
      .then((script) => {
        window.setTimeout(() => script.remove(), 0)
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer)
        window.jsonpgz = undefined
        reject(error instanceof Error ? error : new Error('估值请求失败'))
      })
  })
}

export function fetchFundEstimate(code: string) {
  return queueEstimate(() => fetchFundEstimateInternal(code))
}
