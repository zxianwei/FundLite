<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

import { fetchFundEstimate, searchFunds, type FundSearchResult } from '../services/funds'
import { loadWatchlist, saveWatchlist } from '../services/watchlistStore'

interface WatchedFund {
  code: string
  name: string
  estimate: number | null
  growth: number | null
  nav: number | null
  navDate: string
  estimateTime: string
  isLoading: boolean
  error: string
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const REFRESH_INTERVAL = 30000

const funds = ref<WatchedFund[]>([])
const lastUpdated = ref('')
const refreshProgress = ref(0)
const isRefreshing = ref(false)
const isSearchOpen = ref(false)
const searchQuery = ref('')
const searchResults = ref<FundSearchResult[]>([])
const isSearching = ref(false)
const searchError = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const pendingDeleteCode = ref('')
const pendingDeleteName = ref('')
const pressDeleteCode = ref('')
const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installDismissed = ref(false)
const iosInstallHintDismissed = ref(false)
const isStandalone = ref(false)
const isInstallFlowRunning = ref(false)
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

const isIos = /iphone|ipad|ipod/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent)
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW()

let progressInterval: number | null = null
let searchTimer: number | null = null
let searchToken = 0
let deletePressTimer: number | null = null

const hasFunds = computed(() => funds.value.length > 0)
const canInstallApp = computed(() => !!deferredInstallPrompt.value)
const showInstallBanner = computed(
  () => canInstallApp.value && !isStandalone.value && !installDismissed.value,
)
const showIosInstallHint = computed(
  () => isIos && !isStandalone.value && !canInstallApp.value && !iosInstallHintDismissed.value,
)
const showUpdateBanner = computed(() => needRefresh.value)
const showOfflineReadyBanner = computed(() => offlineReady.value)
const showOfflineBanner = computed(() => !isOnline.value)

function createWatchedFund(input: Pick<WatchedFund, 'code' | 'name'>): WatchedFund {
  return {
    code: input.code,
    name: input.name,
    estimate: null,
    growth: null,
    nav: null,
    navDate: '',
    estimateTime: '',
    isLoading: false,
    error: '',
  }
}

async function persistFunds() {
  const payload = funds.value.map((fund) => ({
    code: fund.code,
    name: fund.name,
  }))
  // 列表展示态和持久化态分开，只保存最小必要字段。
  await saveWatchlist(payload)
}

function setLastUpdated() {
  lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function startProgress() {
  refreshProgress.value = 0
  if (progressInterval) window.clearInterval(progressInterval)
  progressInterval = window.setInterval(() => {
    refreshProgress.value += 100 / (REFRESH_INTERVAL / 100)
    if (refreshProgress.value >= 100) {
      refreshProgress.value = 100
      void refreshFunds()
    }
  }, 100)
}

async function refreshFund(fund: WatchedFund) {
  fund.isLoading = true
  fund.error = ''

  try {
    // 每只基金单独拉估值，避免一只失败影响整个列表。
    const result = await fetchFundEstimate(fund.code)
    fund.name = result.name || fund.name
    fund.estimate = result.estimate
    fund.growth = result.growth
    fund.nav = result.nav
    fund.navDate = result.navDate
    fund.estimateTime = result.estimateTime
  } catch (error: unknown) {
    fund.error = error instanceof Error ? error.message : '估值更新失败'
  } finally {
    fund.isLoading = false
  }
}

async function refreshFunds() {
  if (isRefreshing.value || funds.value.length === 0) return

  isRefreshing.value = true
  // 估值接口是 JSONP，全局回调更稳妥的做法是顺序刷新。
  for (const fund of funds.value) {
    await refreshFund(fund)
  }
  setLastUpdated()
  startProgress()
  window.setTimeout(() => {
    isRefreshing.value = false
  }, 300)
}

function openSearchModal() {
  isSearchOpen.value = true
  searchQuery.value = ''
  searchResults.value = []
  searchError.value = ''

  nextTick(() => {
    // 弹层进场后再聚焦，避免元素还没挂载。
    searchInputRef.value?.focus()
  })
}

function closeSearchModal() {
  isSearchOpen.value = false
  searchQuery.value = ''
  searchResults.value = []
  searchError.value = ''
  isSearching.value = false
}

async function selectFund(result: FundSearchResult) {
  const exists = funds.value.some((fund) => fund.code === result.code)
  if (exists) {
    searchError.value = '该基金已经在首页了'
    return
  }

  const fund = createWatchedFund({
    code: result.code,
    name: result.name,
  })

  // 先把搜索结果里的基础净值带进来，再补一轮实时估值。
  fund.nav = result.nav
  fund.navDate = result.navDate
  funds.value.unshift(fund)
  await persistFunds()
  closeSearchModal()
  await refreshFund(fund)
  setLastUpdated()
}

// 删除走统一确认，桌面点击和移动端左滑都复用这套流程。
function requestRemoveFund(fund: WatchedFund) {
  pendingDeleteCode.value = fund.code
  pendingDeleteName.value = fund.name
}

async function confirmRemoveFund() {
  if (!pendingDeleteCode.value) return
  const code = pendingDeleteCode.value
  funds.value = funds.value.filter((fund) => fund.code !== code)
  await persistFunds()
  closeDeleteDialog()
}

function closeDeleteDialog() {
  pendingDeleteCode.value = ''
  pendingDeleteName.value = ''
}

function startDeletePress(fund: WatchedFund) {
  clearDeletePress()
  pressDeleteCode.value = fund.code
  deletePressTimer = window.setTimeout(() => {
    requestRemoveFund(fund)
    clearDeletePress()
  }, 520)
}

function clearDeletePress() {
  if (deletePressTimer) window.clearTimeout(deletePressTimer)
  deletePressTimer = null
  pressDeleteCode.value = ''
}

function formatGrowth(value: number | null) {
  if (value === null) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatEstimate(value: number | null) {
  if (value === null) return '--'
  return value.toFixed(4)
}

function splitFundName(name: string, maxCharsPerLine = 10) {
  const lines: string[] = []
  for (let index = 0; index < name.length; index += maxCharsPerLine) {
    lines.push(name.slice(index, index + maxCharsPerLine))
  }
  return lines
}

function syncStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  isStandalone.value =
    window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  deferredInstallPrompt.value = event as BeforeInstallPromptEvent
  installDismissed.value = false
}

function handleAppInstalled() {
  deferredInstallPrompt.value = null
  isStandalone.value = true
}

function handleOnline() {
  isOnline.value = true
}

function handleOffline() {
  isOnline.value = false
}

async function promptInstall() {
  if (!deferredInstallPrompt.value || isInstallFlowRunning.value) return

  isInstallFlowRunning.value = true
  await deferredInstallPrompt.value.prompt()
  const choice = await deferredInstallPrompt.value.userChoice
  deferredInstallPrompt.value = null
  installDismissed.value = choice.outcome !== 'accepted'
  isInstallFlowRunning.value = false
}

function dismissInstallBanner() {
  installDismissed.value = true
}

function dismissIosInstallHint() {
  iosInstallHintDismissed.value = true
}

function dismissOfflineReadyBanner() {
  offlineReady.value = false
}

function dismissUpdateBanner() {
  needRefresh.value = false
}

async function applyPwaUpdate() {
  await updateServiceWorker(true)
}

watch(searchQuery, (value) => {
  searchError.value = ''
  if (searchTimer) window.clearTimeout(searchTimer)

  const query = value.trim()
  if (!query) {
    searchResults.value = []
    isSearching.value = false
    return
  }

  const currentToken = ++searchToken
  // 输入防抖 + token 竞态控制，避免旧请求覆盖新结果。
  searchTimer = window.setTimeout(async () => {
    isSearching.value = true
    try {
      const results = await searchFunds(query)
      if (currentToken !== searchToken) return
      searchResults.value = results
      if (results.length === 0) {
        searchError.value = '没有找到匹配的基金'
      }
    } catch (error: unknown) {
      if (currentToken !== searchToken) return
      searchResults.value = []
      searchError.value = error instanceof Error ? error.message : '搜索失败，请稍后重试'
    } finally {
      if (currentToken === searchToken) {
        isSearching.value = false
      }
    }
  }, 280)
})

onMounted(async () => {
  syncStandaloneMode()
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  // 首屏先恢复本地自选，再按当前列表刷新实时估值。
  const storedFunds = await loadWatchlist()
  funds.value = storedFunds.map(createWatchedFund)
  await refreshFunds()
})

onUnmounted(() => {
  if (progressInterval) window.clearInterval(progressInterval)
  if (searchTimer) window.clearTimeout(searchTimer)
  if (deletePressTimer) window.clearTimeout(deletePressTimer)
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  progressInterval = null
  searchTimer = null
  deletePressTimer = null
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white shadow-sm sticky top-0 z-20">
      <div class="container h-14 flex items-center justify-between px-4">
        <h1 class="text-xl font-bold text-blue-600">FundLite</h1>

        <div class="header-actions">
          <button
            type="button"
            class="refresh-btn"
            aria-label="刷新"
            :style="{ '--progress': refreshProgress }"
            @click="refreshFunds"
          >
            <svg class="refresh-btn__progress" viewBox="0 0 32 32" aria-hidden="true">
              <path
                class="refresh-btn__track"
                d="M16 0.5H21.5A10 10 0 0 1 31.5 10.5V21.5A10 10 0 0 1 21.5 31.5H10.5A10 10 0 0 1 0.5 21.5V10.5A10 10 0 0 1 10.5 0.5H16Z"
                pathLength="100"
              />
              <path
                class="refresh-btn__bar"
                d="M16 0.5H21.5A10 10 0 0 1 31.5 10.5V21.5A10 10 0 0 1 21.5 31.5H10.5A10 10 0 0 1 0.5 21.5V10.5A10 10 0 0 1 10.5 0.5H16Z"
                pathLength="100"
                :style="{ strokeDasharray: `${refreshProgress} 100` }"
              />
            </svg>
            <svg
              class="refresh-btn__icon"
              :class="{ 'refresh-btn__icon--spin': isRefreshing }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          <button type="button" class="action-btn" aria-label="添加基金" @click="openSearchModal">
            <svg
              class="action-btn__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="content-wrapper">
      <div
        v-if="
          showInstallBanner ||
          showIosInstallHint ||
          showUpdateBanner ||
          showOfflineReadyBanner ||
          showOfflineBanner
        "
        class="status-stack"
      >
        <div v-if="showInstallBanner" class="app-banner">
          <div>
            <div class="app-banner__title">安装到桌面</div>
            <div class="app-banner__text">添加到手机桌面后，打开会更像原生应用。</div>
          </div>
          <div class="app-banner__actions">
            <button type="button" class="banner-btn banner-btn--ghost" @click="dismissInstallBanner">
              稍后
            </button>
            <button
              type="button"
              class="banner-btn banner-btn--primary"
              :disabled="isInstallFlowRunning"
              @click="promptInstall"
            >
              {{ isInstallFlowRunning ? '处理中' : '立即安装' }}
            </button>
          </div>
        </div>

        <div v-if="showIosInstallHint" class="app-banner app-banner--soft">
          <div>
            <div class="app-banner__title">iPhone 安装方式</div>
            <div class="app-banner__text">
              在 Safari 里点“分享”，再选“添加到主屏幕”。
            </div>
          </div>
          <div class="app-banner__actions">
            <button type="button" class="banner-btn banner-btn--ghost" @click="dismissIosInstallHint">
              知道了
            </button>
          </div>
        </div>

        <div v-if="showUpdateBanner" class="app-banner app-banner--update">
          <div>
            <div class="app-banner__title">发现新版本</div>
            <div class="app-banner__text">刷新后会切到最新缓存和资源。</div>
          </div>
          <div class="app-banner__actions">
            <button type="button" class="banner-btn banner-btn--ghost" @click="dismissUpdateBanner">
              忽略
            </button>
            <button type="button" class="banner-btn banner-btn--primary" @click="applyPwaUpdate">
              立即更新
            </button>
          </div>
        </div>

        <div v-if="showOfflineReadyBanner" class="app-banner app-banner--ready">
          <div>
            <div class="app-banner__title">已支持离线打开</div>
            <div class="app-banner__text">基础页面资源已缓存，断网也能打开应用壳。</div>
          </div>
          <div class="app-banner__actions">
            <button type="button" class="banner-btn banner-btn--ghost" @click="dismissOfflineReadyBanner">
              收起
            </button>
          </div>
        </div>

        <div v-if="showOfflineBanner" class="app-banner app-banner--offline">
          <div>
            <div class="app-banner__title">当前处于离线状态</div>
            <div class="app-banner__text">本地自选仍可查看，联网后再刷新最新估值。</div>
          </div>
        </div>
      </div>

      <div class="flex-between items-center mb-4 px-1 gap-4">
        <span class="text-xs text-gray-400">
          {{ lastUpdated ? `更新于 ${lastUpdated}` : '正在连接基金估值接口' }}
        </span>
        <span class="text-xs text-blue-500 font-medium">共 {{ funds.length }} 只基金</span>
      </div>

      <div v-if="hasFunds" class="fund-table-shell">
        <div class="fund-table__scroller">
          <div class="fund-table__row fund-table__header">
            <div class="fund-table__cell fund-table__cell--sticky">基金名称</div>
            <div class="fund-table__cell fund-table__cell--num">涨跌</div>
            <div class="fund-table__cell fund-table__cell--num">估值</div>
          </div>

          <div
            v-for="fund in funds"
            :key="fund.code"
            class="fund-table__row fund-table__body-row"
          >
            <div
              class="fund-table__cell fund-table__cell--sticky"
              :class="{ 'fund-table__cell--pressing': pressDeleteCode === fund.code }"
              @touchstart.passive="startDeletePress(fund)"
              @touchend="clearDeletePress"
              @touchcancel="clearDeletePress"
              @touchmove="clearDeletePress"
              @mousedown="startDeletePress(fund)"
              @mouseup="clearDeletePress"
              @mouseleave="clearDeletePress"
            >
              <div class="fund-table__name">
                <span
                  v-for="(line, idx) in splitFundName(fund.name)"
                  :key="`${fund.code}-${idx}`"
                  class="block"
                >
                  {{ line }}
                </span>
              </div>
              <div class="fund-table__sub-row">
                <div class="fund-table__sub tabular-nums">{{ fund.code }}</div>
              </div>
              <div v-if="fund.error" class="fund-table__error">
                {{ fund.error }}
              </div>
            </div>

            <div class="fund-table__cell fund-table__cell--num tabular-nums">
              <span
                :class="[
                  'fund-table__value',
                  fund.growth === null
                    ? 'text-gray-400'
                    : fund.growth >= 0
                      ? 'text-red-600'
                      : 'text-green-600',
                ]"
              >
                {{ fund.isLoading ? '更新中' : formatGrowth(fund.growth) }}
              </span>
            </div>

            <div class="fund-table__cell fund-table__cell--num tabular-nums">
              <span class="fund-table__value fund-table__value--estimate">
                {{ fund.isLoading ? '--' : formatEstimate(fund.estimate) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p class="empty-state__hint">点击右上角 + 添加基金</p>
      </div>

      <div class="text-center text-xs text-gray-400 mt-6">
        数据仅供参考，实时估值与净值以基金公司披露为准
      </div>
    </main>

    <div v-if="isSearchOpen" class="search-modal" @click.self="closeSearchModal">
      <div class="search-panel">
        <div class="search-panel__header">
          <div>
            <div class="search-panel__title">添加基金</div>
            <div class="search-panel__subtitle">支持基金代码、简称、关键词搜索</div>
          </div>

          <button
            type="button"
            class="search-panel__close"
            aria-label="关闭"
            @click="closeSearchModal"
          >
            ×
          </button>
        </div>

        <div class="search-input-wrap">
          <svg
            class="search-input__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="7"></circle>
            <path stroke-linecap="round" d="m20 20-3.5-3.5"></path>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="search-input"
            type="text"
            placeholder="输入基金代码或名称，例如 161725 / 白酒"
          />
        </div>

        <div class="search-results">
          <div v-if="isSearching" class="search-status">正在搜索基金...</div>

          <div v-else-if="searchError" class="search-status search-status--error">
            {{ searchError }}
          </div>

          <template v-else-if="searchResults.length > 0">
            <button
              v-for="item in searchResults"
              :key="item.code"
              type="button"
              class="search-result"
              @click="selectFund(item)"
            >
              <div class="search-result__main">
                <div class="search-result__name">
                  {{ item.name }}
                </div>
                <div class="search-result__meta">
                  {{ item.code }}<span v-if="item.company"> · {{ item.company }}</span>
                </div>
              </div>
              <div class="search-result__side">
                <div class="search-result__nav">
                  {{ item.nav === null ? '--' : item.nav.toFixed(4) }}
                </div>
                <div class="search-result__nav-date">
                  {{ item.navDate || '最新净值' }}
                </div>
              </div>
            </button>
          </template>

          <div v-else class="search-status">输入关键词后开始搜索</div>
        </div>
      </div>
    </div>

    <div v-if="pendingDeleteCode" class="dialog-backdrop" @click.self="closeDeleteDialog">
      <div class="dialog-card">
        <div class="dialog-card__title">确认删除</div>
        <div class="dialog-card__text">
          删除后会从首页和本地存储中移除「{{ pendingDeleteName }}」
        </div>
        <div class="dialog-card__actions">
          <button type="button" class="dialog-btn dialog-btn--ghost" @click="closeDeleteDialog">
            取消
          </button>
          <button type="button" class="dialog-btn dialog-btn--danger" @click="confirmRemoveFund">
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-stack {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
}

.app-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 22px;
  border: 1px solid rgba(15, 118, 110, 0.14);
  background:
    linear-gradient(135deg, rgba(243, 248, 245, 0.98), rgba(233, 245, 241, 0.98)),
    #f5f8f2;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
}

.app-banner--soft {
  border-color: rgba(217, 119, 6, 0.16);
  background:
    linear-gradient(135deg, rgba(255, 250, 237, 0.98), rgba(255, 244, 229, 0.98)),
    #fff8eb;
}

.app-banner--update {
  border-color: rgba(37, 99, 235, 0.14);
  background:
    linear-gradient(135deg, rgba(241, 246, 255, 0.98), rgba(232, 241, 255, 0.98)),
    #f4f7ff;
}

.app-banner--ready {
  border-color: rgba(20, 83, 45, 0.14);
  background:
    linear-gradient(135deg, rgba(240, 249, 241, 0.98), rgba(229, 245, 232, 0.98)),
    #f1f8f2;
}

.app-banner--offline {
  border-color: rgba(120, 113, 108, 0.14);
  background:
    linear-gradient(135deg, rgba(248, 247, 245, 0.98), rgba(242, 240, 236, 0.98)),
    #f6f3ee;
}

.app-banner__title {
  font-size: 14px;
  line-height: 1.3;
  font-weight: 700;
  color: #0f172a;
}

.app-banner__text {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(15, 23, 42, 0.7);
}

.app-banner__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.banner-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 0;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 150ms ease,
    background-color 150ms ease,
    opacity 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.banner-btn:hover {
  transform: translateY(-1px);
}

.banner-btn:disabled {
  cursor: default;
  opacity: 0.6;
  transform: none;
}

.banner-btn--primary {
  background: #0f766e;
  color: #f8fafc;
}

.banner-btn--primary:hover {
  background: #0b665f;
}

.banner-btn--ghost {
  background: rgba(255, 255, 255, 0.78);
  color: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.refresh-btn {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #fff;
  border: 0;
  color: #2563eb;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.refresh-btn:hover {
  background: #f9fafb;
}

.refresh-btn:active {
  background: #f3f4f6;
}

.refresh-btn:focus-visible,
.action-btn:focus-visible,
.banner-btn:focus-visible,
.search-panel__close:focus-visible,
.search-result:focus-visible,
.search-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

@media (max-width: 640px) {
  .app-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .app-banner__actions {
    width: 100%;
  }
}

.action-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(191, 219, 254, 1);
  color: #2563eb;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.action-btn:hover {
  background: #eff6ff;
  border-color: rgba(147, 197, 253, 1);
}

.action-btn:active {
  background: #dbeafe;
}

.action-btn__icon,
.refresh-btn__icon {
  width: 16px;
  height: 16px;
}

.refresh-btn__progress {
  position: absolute;
  inset: 0;
  width: 32px;
  height: 32px;
  pointer-events: none;
}

.refresh-btn__track,
.refresh-btn__bar {
  fill: none;
  stroke-width: 1;
}

.refresh-btn__track {
  stroke: rgba(229, 231, 235, 0.95);
}

.refresh-btn:hover .refresh-btn__track {
  stroke: rgba(209, 213, 219, 0.95);
}

.refresh-btn__bar {
  stroke: #60a5fa;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.refresh-btn__icon--spin {
  animation: refresh-spin 700ms linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.fund-table-shell {
  overflow: hidden;
  border: 1px solid rgba(219, 234, 254, 0.88);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(248, 251, 255, 0.96) 0%, rgba(255, 255, 255, 1) 22%),
    #fff;
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.fund-table__scroller {
  --fund-name-col: clamp(160px, 11.5rem, 220px);
  overflow-x: auto;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.65), rgba(255, 255, 255, 0.98));
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
}

.fund-table__scroller::-webkit-scrollbar {
  height: 8px;
}

.fund-table__scroller::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.4);
  border-radius: 999px;
}

.fund-table__scroller::-webkit-scrollbar-track {
  background: transparent;
}

.fund-table__row {
  display: grid;
  grid-template-columns: var(--fund-name-col) 80px 96px;
  align-items: center;
  min-width: calc(var(--fund-name-col) + 80px + 96px);
}

.fund-table__header {
  position: sticky;
  top: 0;
  z-index: 4;
  background: linear-gradient(180deg, rgba(240, 247, 255, 0.92), rgba(248, 250, 252, 0.96));
  border-bottom: 1px solid rgba(226, 232, 240, 0.95);
  color: #7b8aa0;
  font-size: 11px;
  letter-spacing: 0.08em;
  font-weight: 500;
  text-transform: uppercase;
}

.fund-table__body-row {
  border-bottom: 1px solid rgba(241, 245, 249, 0.95);
  transition:
    background-color 150ms ease,
    transform 180ms ease;
}

.fund-table__body-row:last-child {
  border-bottom: 0;
}

.fund-table__body-row:nth-child(2n) {
  background: rgba(251, 253, 255, 0.72);
}

.fund-table__body-row:hover {
  background: rgba(248, 250, 252, 0.9);
}

.fund-table__cell {
  position: relative;
  padding: 14px 16px;
}

.fund-table__cell--num {
  text-align: right;
}

.fund-table__cell--sticky {
  position: sticky;
  left: 0;
  z-index: 2;
  background:
    linear-gradient(90deg, rgba(247, 250, 255, 1) 0%, rgba(255, 255, 255, 0.98) 82%),
    #fff;
  transition:
    background-color 180ms ease,
    box-shadow 180ms ease;
}

.fund-table__cell--pressing {
  background:
    linear-gradient(90deg, rgba(254, 242, 242, 0.98) 0%, rgba(255, 255, 255, 0.98) 82%),
    #fff;
  box-shadow: inset 0 0 0 1px rgba(252, 165, 165, 0.28);
}

.fund-table__header .fund-table__cell--sticky {
  background: linear-gradient(90deg, rgba(239, 246, 255, 0.96) 0%, rgba(248, 250, 252, 0.98) 88%);
  z-index: 3;
}

.fund-table__cell--sticky::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: rgba(226, 232, 240, 0.95);
  box-shadow: 12px 0 18px rgba(37, 99, 235, 0.04);
}

.fund-table__name {
  max-width: 11em;
  color: #172033;
  font-size: 15px;
  line-height: 20px;
  font-weight: 700;
  word-break: break-all;
  letter-spacing: -0.01em;
}

.fund-table__sub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fund-table__sub {
  margin-top: 5px;
  color: #8a97ab;
  font-size: 12px;
  line-height: 16px;
}

.fund-table__error {
  margin-top: 4px;
  color: #ef4444;
  font-size: 12px;
  line-height: 16px;
}

.fund-table__value {
  display: inline-block;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.fund-table__value--estimate {
  color: #172033;
  font-size: 17px;
}

.empty-state {
  text-align: center;
  padding: 5rem 1rem;
}

.empty-state__hint {
  color: #9ca3af;
  font-size: 14px;
}

.search-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  padding: 24px;
  background: rgba(15, 23, 42, 0.36);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.search-panel {
  width: min(100%, 640px);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(239, 246, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 24%), #fff;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
}

.search-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.search-panel__title {
  color: #111827;
  font-size: 20px;
  line-height: 28px;
  font-weight: 700;
}

.search-panel__subtitle {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
  line-height: 20px;
}

.search-panel__close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.75);
  color: #6b7280;
  cursor: pointer;
}

.search-input-wrap {
  position: relative;
}

.search-input__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #9ca3af;
  transform: translateY(-50%);
}

.search-input {
  width: 100%;
  height: 48px;
  padding: 0 16px 0 44px;
  border: 1px solid rgba(191, 219, 254, 1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: #111827;
  font-size: 15px;
}

.search-results {
  overflow-y: auto;
  min-height: 220px;
}

.search-status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: #9ca3af;
  font-size: 14px;
}

.search-status--error {
  color: #ef4444;
}

.search-result {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid rgba(243, 244, 246, 1);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    transform 150ms ease,
    background-color 150ms ease;
}

.search-result:hover {
  background: rgba(239, 246, 255, 0.6);
}

.search-result__main {
  min-width: 0;
}

.search-result__name {
  color: #111827;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
}

.search-result__meta,
.search-result__nav-date {
  margin-top: 4px;
  color: #9ca3af;
  font-size: 12px;
  line-height: 18px;
}

.search-result__side {
  text-align: right;
}

.search-result__nav {
  color: #2563eb;
  font-size: 15px;
  line-height: 22px;
  font-weight: 700;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(6px);
}

.dialog-card {
  width: min(100%, 360px);
  padding: 20px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}

.dialog-card__title {
  color: #111827;
  font-size: 18px;
  font-weight: 700;
}

.dialog-card__text {
  margin-top: 8px;
  color: #6b7280;
  font-size: 14px;
  line-height: 22px;
}

.dialog-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.dialog-btn {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-btn--ghost {
  background: #f3f4f6;
  color: #4b5563;
}

.dialog-btn--danger {
  background: #ef4444;
  color: #fff;
}

@media (max-width: 640px) {
  .search-modal {
    padding: 12px;
  }

  .fund-table-shell {
    border-radius: 18px;
  }

  .search-panel {
    padding: 16px;
    border-radius: 20px;
  }

  .search-result {
    align-items: flex-start;
  }

  .fund-table__cell {
    padding: 13px 14px;
  }

  .fund-table__value {
    font-size: 17px;
  }

  .fund-table__value--estimate {
    font-size: 16px;
  }

  .fund-table__name {
    max-width: 10.6em;
  }
}
</style>
