<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

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
const swipedFundCode = ref('')

let progressInterval: number | null = null
let searchTimer: number | null = null
let searchToken = 0
// 记录触摸起点和位移，用于移动端左滑删除。
let touchStartX = 0
let touchDeltaX = 0

const hasFunds = computed(() => funds.value.length > 0)

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
  if (swipedFundCode.value === code) {
    swipedFundCode.value = ''
  }
  await persistFunds()
  closeDeleteDialog()
}

function closeDeleteDialog() {
  pendingDeleteCode.value = ''
  pendingDeleteName.value = ''
}

// 轻量左滑：滑过阈值后露出删除操作，再点按钮进入二次确认。
function handleTouchStart(event: TouchEvent, code: string) {
  swipedFundCode.value = swipedFundCode.value === code ? '' : swipedFundCode.value
  touchStartX = event.touches[0]?.clientX ?? 0
  touchDeltaX = 0
}

function handleTouchMove(event: TouchEvent) {
  const currentX = event.touches[0]?.clientX ?? touchStartX
  touchDeltaX = currentX - touchStartX
}

function handleTouchEnd(code: string) {
  if (touchDeltaX <= -48) {
    swipedFundCode.value = code
  } else if (touchDeltaX >= 24 && swipedFundCode.value === code) {
    swipedFundCode.value = ''
  }
  touchStartX = 0
  touchDeltaX = 0
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
  // 首屏先恢复本地自选，再按当前列表刷新实时估值。
  const storedFunds = await loadWatchlist()
  funds.value = storedFunds.map(createWatchedFund)
  await refreshFunds()
})

onUnmounted(() => {
  if (progressInterval) window.clearInterval(progressInterval)
  if (searchTimer) window.clearTimeout(searchTimer)
  progressInterval = null
  searchTimer = null
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
      <div class="flex-between items-center mb-4 px-1 gap-4">
        <span class="text-xs text-gray-400">
          {{ lastUpdated ? `更新于 ${lastUpdated}` : '正在连接基金估值接口' }}
        </span>
        <span class="text-xs text-blue-500 font-medium">共 {{ funds.length }} 只基金</span>
      </div>

      <div v-if="hasFunds" class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="fund-table__scroller">
          <div class="fund-table__row fund-table__header">
            <div class="fund-table__cell fund-table__cell--sticky">基金名称</div>
            <div class="fund-table__cell fund-table__cell--num">涨跌</div>
            <div class="fund-table__cell fund-table__cell--num">估值</div>
          </div>

          <div
            v-for="fund in funds"
            :key="fund.code"
            class="fund-swipe-row"
            :class="{ 'fund-swipe-row--open': swipedFundCode === fund.code }"
          >
            <button
              type="button"
              class="fund-swipe-row__delete"
              :aria-label="`删除 ${fund.name}`"
              @click="requestRemoveFund(fund)"
            >
              删除
            </button>

            <div
              class="fund-table__row fund-table__body-row"
              @touchstart.passive="handleTouchStart($event, fund.code)"
              @touchmove.passive="handleTouchMove($event)"
              @touchend="handleTouchEnd(fund.code)"
            >
              <div class="fund-table__cell fund-table__cell--sticky">
                <button
                  type="button"
                  class="fund-table__remove"
                  :aria-label="`删除 ${fund.name}`"
                  @click.stop="requestRemoveFund(fund)"
                >
                  ×
                </button>
                <div class="fund-table__name">
                  <span
                    v-for="(line, idx) in splitFundName(fund.name)"
                    :key="`${fund.code}-${idx}`"
                    class="block"
                  >
                    {{ line }}
                  </span>
                </div>
                <div class="fund-table__sub tabular-nums">
                  {{ fund.code }}
                </div>
                <div v-if="fund.error" class="fund-table__error">
                  {{ fund.error }}
                </div>
              </div>

              <div class="fund-table__cell fund-table__cell--num tabular-nums">
                <span
                  :class="[
                    fund.growth === null
                      ? 'text-gray-400'
                      : fund.growth >= 0
                        ? 'text-red-600'
                        : 'text-green-600',
                  ]"
                >
                  {{ fund.isLoading ? '更新中' : formatGrowth(fund.growth) }}
                </span>
                <div class="fund-table__meta">
                  {{ fund.estimateTime ? fund.estimateTime.slice(11, 16) : '--:--' }}
                </div>
              </div>

              <div class="fund-table__cell fund-table__cell--num tabular-nums">
                {{ fund.isLoading ? '--' : formatEstimate(fund.estimate) }}
                <div class="fund-table__meta">
                  净值 {{ fund.nav === null ? '--' : fund.nav.toFixed(4) }}
                </div>
              </div>
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
.search-panel__close:focus-visible,
.search-result:focus-visible,
.search-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
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

.fund-table__scroller {
  --fund-name-col: clamp(160px, 11.5rem, 220px);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.fund-table__row {
  display: grid;
  grid-template-columns: var(--fund-name-col) 80px 96px;
  align-items: center;
  min-width: calc(var(--fund-name-col) + 80px + 96px);
}

.fund-table__header {
  background: rgba(249, 250, 251, 0.6);
  border-bottom: 1px solid rgba(243, 244, 246, 1);
  color: rgba(156, 163, 175, 1);
  font-size: 12px;
  line-height: 20px;
  font-weight: 500;
}

.fund-table__body-row {
  border-bottom: 1px solid rgba(243, 244, 246, 1);
  transition: background-color 150ms ease;
}

.fund-swipe-row {
  position: relative;
  overflow: hidden;
  background: #fff;
}

.fund-swipe-row__delete {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 72px;
  border: 0;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.fund-swipe-row--open .fund-table__body-row {
  transform: translateX(-72px);
}

.fund-table__body-row:last-child {
  border-bottom: 0;
}

.fund-table__body-row:hover {
  background: rgba(249, 250, 251, 0.6);
}

.fund-swipe-row .fund-table__body-row {
  position: relative;
  background: #fff;
  transition:
    transform 180ms ease,
    background-color 150ms ease;
  z-index: 1;
}

.fund-table__cell {
  position: relative;
  padding: 12px 16px;
}

.fund-table__cell--num {
  text-align: right;
}

.fund-table__cell--sticky {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
}

.fund-table__header .fund-table__cell--sticky {
  background: rgba(249, 250, 251, 0.6);
  z-index: 3;
}

.fund-table__cell--sticky::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: rgba(243, 244, 246, 1);
}

.fund-table__name {
  padding-right: 18px;
  color: rgba(17, 24, 39, 1);
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
  word-break: break-all;
}

.fund-table__remove {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  color: #94a3b8;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 150ms ease,
    background-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.fund-table__body-row:hover .fund-table__remove,
.fund-table__remove:focus-visible {
  opacity: 1;
}

.fund-table__remove:hover {
  background: rgba(254, 226, 226, 1);
  color: #dc2626;
  transform: scale(1.05);
}

.fund-table__remove:active {
  background: rgba(254, 202, 202, 1);
}

.fund-table__sub,
.fund-table__meta {
  margin-top: 4px;
  color: rgba(156, 163, 175, 1);
  font-size: 12px;
  line-height: 16px;
}

.fund-table__error {
  margin-top: 4px;
  color: #ef4444;
  font-size: 12px;
  line-height: 16px;
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

  .search-panel {
    padding: 16px;
    border-radius: 20px;
  }

  .search-result {
    align-items: flex-start;
  }

  .fund-table__remove {
    display: none;
  }
}
</style>
