<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { fetchFundEstimate, searchFunds, type FundSearchResult } from '../services/funds'
import { loadWatchlist, saveWatchlist, exportWatchlist, importWatchlist, type StoredFund } from '../services/watchlistStore'
import { useTheme } from '../composables/useTheme'
import FeatureNotice from '../components/FeatureNotice.vue'

import IconSun from '../components/icons/IconSun.vue'
import IconMoon from '../components/icons/IconMoon.vue'
import IconRefresh from '../components/icons/IconRefresh.vue'
import IconAdd from '../components/icons/IconAdd.vue'
import IconSettings from '../components/icons/IconSettings.vue'
import IconChevronUp from '../components/icons/IconChevronUp.vue'
import IconChevronDown from '../components/icons/IconChevronDown.vue'
import IconSearch from '../components/icons/IconSearch.vue'
import IconExport from '../components/icons/IconExport.vue'
import IconImport from '../components/icons/IconImport.vue'

const { theme, toggleTheme } = useTheme()

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
const pressDeleteCode = ref('')
const isSettingsOpen = ref(false)
const importFileInputRef = ref<HTMLInputElement | null>(null)
const importError = ref('')
const importSuccess = ref('')

// 排序状态: 'none' | 'asc' | 'desc'
const growthSortOrder = ref<'none' | 'asc' | 'desc'>('none')

// 新功能列表 - 每次更新时修改 version 和列表内容
// 版本号规则：主版本.功能版本.修复版本（如 1.0.0 → 1.1.0 新增功能 → 1.1.1 修复）
const currentVersion = '1.1.0'
const featureList = [
  { title: '暗黑模式', desc: '支持亮色/暗黑主题切换，自动适配系统偏好，保护眼睛' },
]


const hasFunds = computed(() => funds.value.length > 0)

// 根据排序状态对基金列表进行排序
const sortedFunds = computed(() => {
  if (growthSortOrder.value === 'none') {
    return funds.value
  }
  return [...funds.value].sort((a, b) => {
    // 处理 null 值：null 值排在最后
    if (a.growth === null && b.growth === null) return 0
    if (a.growth === null) return 1
    if (b.growth === null) return -1
    // 升序：从小到大（负数到正数）
    // 降序：从大到小（正数到负数）
    return growthSortOrder.value === 'asc' ? b.growth - a.growth : a.growth - b.growth
  })
})

// 切换排序状态
function toggleGrowthSort() {
  if (growthSortOrder.value === 'none') {
    growthSortOrder.value = 'asc' // 第一次点击：升序（低到高）
  } else if (growthSortOrder.value === 'asc') {
    growthSortOrder.value = 'desc' // 第二次点击：降序（高到低）
  } else {
    growthSortOrder.value = 'none' // 第三次点击：恢复默认
  }
}

let progressInterval: number | null = null
let searchTimer: number | null = null
let searchToken = 0
let deletePressTimer: number | null = null
let importMessageTimer: number | null = null
let extraRefreshTimer: number | null = null

// 检查当前是否在交易时间内（9:30 - 15:00）
function isInTradingHours(): boolean {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const totalMinutes = hours * 60 + minutes

  // 交易时间：9:30 - 15:00
  const startMinutes = 9 * 60 + 30
  const endMinutes = 15 * 60

  return totalMinutes >= startMinutes && totalMinutes < endMinutes
}

// 检查是否有基金没有获取到涨跌数据
function hasEmptyGrowth(): boolean {
  return funds.value.some((fund) => !fund.error && fund.growth === null)
}

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

  // 非交易时间不启动自动刷新
  if (!isInTradingHours()) {
    refreshProgress.value = 0
    return
  }

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

  // 如果有没有获取到涨跌的数据，3秒后额外刷新一次
  if (hasEmptyGrowth()) {
    if (extraRefreshTimer) window.clearTimeout(extraRefreshTimer)
    extraRefreshTimer = window.setTimeout(() => {
      void refreshFunds()
    }, 3000)
  }

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

// 设置面板
function openSettingsModal() {
  isSettingsOpen.value = true
  importError.value = ''
  importSuccess.value = ''
}

function closeSettingsModal() {
  isSettingsOpen.value = false
  importError.value = ''
  importSuccess.value = ''
  if (importMessageTimer) {
    window.clearTimeout(importMessageTimer)
    importMessageTimer = null
  }
}

// 导出数据
function handleExport() {
  const payload = funds.value.map((fund) => ({
    code: fund.code,
    name: fund.name,
  }))
  const json = exportWatchlist(payload)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `fundlite-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 选择导入文件
function handleImportClick() {
  importFileInputRef.value?.click()
}

// 处理导入文件
async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  importError.value = ''
  importSuccess.value = ''

  try {
    const text = await file.text()
    const result = importWatchlist(text)

    if (!result.success || !result.funds) {
      importError.value = result.error || '导入失败'
      return
    }

    // 合并现有数据，避免重复
    const existingCodes = new Set(funds.value.map((f) => f.code))
    const newFunds = result.funds.filter((f: StoredFund) => !existingCodes.has(f.code))

    if (newFunds.length === 0) {
      importSuccess.value = '导入成功：没有新的基金需要添加'
    } else {
      // 添加新基金
      for (const fund of newFunds) {
        funds.value.push(createWatchedFund(fund))
      }
      await persistFunds()
      await refreshFunds()
      importSuccess.value = `成功导入 ${newFunds.length} 只基金`
    }

    // 3秒后清除成功消息
    if (importMessageTimer) window.clearTimeout(importMessageTimer)
    importMessageTimer = window.setTimeout(() => {
      importSuccess.value = ''
    }, 3000)
  } catch {
    importError.value = '读取文件失败'
  } finally {
    // 清空 input 以便可以重复选择同一文件
    input.value = ''
  }
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
  if (deletePressTimer) window.clearTimeout(deletePressTimer)
  if (importMessageTimer) window.clearTimeout(importMessageTimer)
  if (extraRefreshTimer) window.clearTimeout(extraRefreshTimer)
  progressInterval = null
  searchTimer = null
  deletePressTimer = null
  importMessageTimer = null
  extraRefreshTimer = null
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white shadow-sm sticky top-0 z-20">
      <div class="container h-14 flex items-center justify-between px-4">
        <h1 class="text-xl font-bold text-blue-600">FundLite</h1>

        <div class="header-actions">
          <button type="button" class="theme-toggle-btn" aria-label="切换主题" @click="toggleTheme">
            <IconSun v-if="theme === 'dark'" class="theme-toggle__icon" />
            <IconMoon v-else class="theme-toggle__icon" />
          </button>

          <div class="refresh-btn-wrap">
            <button type="button" class="refresh-btn" aria-label="刷新" :style="{ '--progress': refreshProgress }"
              @click="refreshFunds">
              <IconRefresh :spin="isRefreshing" class="refresh-btn__icon" />
            </button>
          </div>

          <button type="button" class="action-btn" aria-label="添加基金" @click="openSearchModal">
            <IconAdd class="action-btn__icon" />
          </button>

          <button type="button" class="action-btn" aria-label="设置" @click="openSettingsModal">
            <IconSettings class="action-btn__icon" />
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

      <div v-if="hasFunds" class="fund-table-shell">
        <div class="fund-table__scroller">
          <div class="fund-table__row fund-table__header">
            <div class="fund-table__cell fund-table__cell--sticky">基金名称</div>
            <div class="fund-table__cell fund-table__cell--num fund-table__cell--sortable" @click="toggleGrowthSort">
              <div class="fund-table__sort-header">
                <span>涨跌</span>
                <span class="fund-table__sort-icons">
                  <IconChevronUp class="fund-table__sort-arrow"
                    :class="{ 'fund-table__sort-arrow--active': growthSortOrder === 'asc' }" />
                  <IconChevronDown class="fund-table__sort-arrow"
                    :class="{ 'fund-table__sort-arrow--active': growthSortOrder === 'desc' }" />
                </span>
              </div>
            </div>
            <div class="fund-table__cell fund-table__cell--num">估值</div>
          </div>

          <div v-for="fund in sortedFunds" :key="fund.code" class="fund-table__row fund-table__body-row">
            <div class="fund-table__cell fund-table__cell--sticky"
              :class="{ 'fund-table__cell--pressing': pressDeleteCode === fund.code }"
              @touchstart.passive="startDeletePress(fund)" @touchend="clearDeletePress" @touchcancel="clearDeletePress"
              @touchmove="clearDeletePress" @mousedown="startDeletePress(fund)" @mouseup="clearDeletePress"
              @mouseleave="clearDeletePress">
              <div class="fund-table__name" :title="fund.name">
                {{ fund.name.slice(0, 8) }}{{ fund.name.length > 8 ? '…' : '' }}
              </div>
              <div class="fund-table__sub-row">
                <div class="fund-table__sub tabular-nums">{{ fund.code }}</div>
              </div>
              <div v-if="fund.error" class="fund-table__error">
                {{ fund.error }}
              </div>
            </div>

            <div class="fund-table__cell fund-table__cell--num tabular-nums">
              <span :class="[
                'fund-table__value',
                fund.growth === null
                  ? 'text-gray-400'
                  : fund.growth >= 0
                    ? 'text-red-600'
                    : 'text-green-600',
              ]">
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

          <button type="button" class="search-panel__close" aria-label="关闭" @click="closeSearchModal">
            ×
          </button>
        </div>

        <div class="search-input-wrap">
          <IconSearch class="search-input__icon" />
          <input ref="searchInputRef" v-model="searchQuery" class="search-input" type="text"
            placeholder="输入基金代码或名称，例如 161725 / 白酒" />
        </div>

        <div class="search-results">
          <div v-if="isSearching" class="search-status">正在搜索基金...</div>

          <div v-else-if="searchError" class="search-status search-status--error">
            {{ searchError }}
          </div>

          <template v-else-if="searchResults.length > 0">
            <button v-for="item in searchResults" :key="item.code" type="button" class="search-result"
              @click="selectFund(item)">
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

    <!-- 设置面板 -->
    <div v-if="isSettingsOpen" class="search-modal" @click.self="closeSettingsModal">
      <div class="settings-panel">
        <div class="search-panel__header">
          <div>
            <div class="search-panel__title">数据管理</div>
            <div class="search-panel__subtitle">导入导出基金数据，方便在不同浏览器间迁移</div>
          </div>

          <button type="button" class="search-panel__close" aria-label="关闭" @click="closeSettingsModal">
            ×
          </button>
        </div>

        <div class="settings-content">
          <div class="settings-section">
            <h3 class="settings-section__title">导出数据</h3>
            <p class="settings-section__desc">将当前基金列表导出为 JSON 文件，可用于备份或迁移到其他浏览器</p>
            <button type="button" class="settings-btn settings-btn--primary" @click="handleExport">
              <IconExport class="settings-btn__icon" />
              导出基金数据
            </button>
          </div>

          <div class="settings-divider"></div>

          <div class="settings-section">
            <h3 class="settings-section__title">导入数据</h3>
            <p class="settings-section__desc">从 JSON 文件导入基金列表，会自动合并到现有数据中（跳过重复项）</p>
            <input ref="importFileInputRef" type="file" accept=".json" class="settings-file-input"
              @change="handleImportFile" />
            <button type="button" class="settings-btn settings-btn--secondary" @click="handleImportClick">
              <IconImport class="settings-btn__icon" />
              选择文件导入
            </button>

            <div v-if="importError" class="settings-message settings-message--error">
              {{ importError }}
            </div>
            <div v-if="importSuccess" class="settings-message settings-message--success">
              {{ importSuccess }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新功能提示 -->
    <FeatureNotice :version="currentVersion" title="🎉 新功能上线" :features="featureList" confirm-text="知道了"
      :debug="false" />
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme-toggle-btn {
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
    box-shadow 150ms ease,
    color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.theme-toggle-btn:hover {
  background: #eff6ff;
  border-color: rgba(147, 197, 253, 1);
}

.theme-toggle-btn:active {
  background: #dbeafe;
}

.theme-toggle__icon {
  width: 16px;
  height: 16px;
}

.refresh-btn-wrap {
  position: relative;
  display: inline-flex;
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
  border: 1px solid rgba(191, 219, 254, 1);
  color: #2563eb;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.refresh-btn:hover {
  background: #eff6ff;
  border-color: rgba(147, 197, 253, 1);
}

.refresh-btn:active {
  background: #dbeafe;
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

.refresh-btn__icon--spin {
  animation: refresh-spin 700ms linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.content-wrapper {
  padding-left: 0;
  padding-right: 0;
}

.fund-table-shell {
  background: #fff;
}

.fund-table__scroller {
  overflow-x: auto;
  background: #fff;
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
  grid-template-columns: 140px 80px 96px;
  align-items: center;
  min-width: 316px;
}

.fund-table__header {
  position: sticky;
  top: 0;
  z-index: 4;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  color: #7b8aa0;
  font-size: 11px;
  letter-spacing: 0.08em;
  font-weight: 500;
  text-transform: uppercase;
}

.fund-table__body-row {
  border-bottom: 1px solid #f1f5f9;
}

.fund-table__cell {
  position: relative;
  padding: 4px 12px;
}

.fund-table__cell--num {
  text-align: center;
}

.fund-table__cell--sticky {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
}

.fund-table__cell--pressing {
  background: #fef2f2;
}

.fund-table__header .fund-table__cell {
  padding: 16px 12px 12px;
}

.fund-table__header .fund-table__cell--sticky {
  background: #f8fafc;
  z-index: 3;
}

.fund-table__cell--sticky::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: #e2e8f0;
}

.fund-table__name {
  max-width: 11em;
  color: #172033;
  font-size: 15px;
  line-height: 20px;
  font-weight: 700;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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

.fund-table__sort-header {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  cursor: pointer;
  user-select: none;
}

.fund-table__sort-icons {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-left: 4px;
  height: 20px;
}

.fund-table__sort-arrow {
  width: 14px;
  height: 10px;
  color: #d1d5db;
  transition: color 150ms ease;
}

.fund-table__sort-arrow--active {
  color: #2563eb;
}

.fund-table__sort-header:hover .fund-table__sort-arrow {
  color: #9ca3af;
}

.fund-table__sort-header:hover .fund-table__sort-arrow--active {
  color: #2563eb;
}

.fund-table__cell--sortable {
  cursor: pointer;
}

.fund-table__cell--sortable:hover {
  color: #2563eb;
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

  .settings-panel {
    padding: 16px;
    border-radius: 20px;
  }
}

/* 设置面板样式 */
.settings-panel {
  width: min(100%, 480px);
  max-height: min(80vh, 600px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(239, 246, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 24%), #fff;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
}

.settings-content {
  overflow-y: auto;
}

.settings-section {
  padding: 4px 0;
}

.settings-section__title {
  color: #111827;
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.settings-section__desc {
  color: #6b7280;
  font-size: 13px;
  line-height: 20px;
  margin: 0 0 16px 0;
}

.settings-divider {
  height: 1px;
  background: rgba(226, 232, 240, 0.95);
  margin: 8px 0;
}

.settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    transform 100ms ease;
}

.settings-btn__icon {
  width: 18px;
  height: 18px;
}

.settings-btn--primary {
  background: #2563eb;
  color: #fff;
}

.settings-btn--primary:hover {
  background: #1d4ed8;
}

.settings-btn--primary:active {
  background: #1e40af;
  transform: scale(0.98);
}

.settings-btn--secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid rgba(209, 213, 219, 1);
}

.settings-btn--secondary:hover {
  background: #e5e7eb;
}

.settings-btn--secondary:active {
  background: #d1d5db;
  transform: scale(0.98);
}

.settings-file-input {
  display: none;
}

.settings-message {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 20px;
}

.settings-message--error {
  background: #fef2f2;
  color: #dc2626;
}

.settings-message--success {
  background: #f0fdf4;
  color: #16a34a;
}

/* ==================== 暗黑模式样式 ==================== */

/* 根元素暗黑模式下的基础样式 */
.dark body {
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.08), transparent 32%),
    linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
}

.dark .min-h-screen.bg-gray-50 {
  background: transparent;
}

/* Header 暗黑模式 */
.dark header.bg-white {
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%);
  border-bottom-color: rgba(51, 65, 85, 0.8);
}

.dark header .text-blue-600 {
  color: #60a5fa;
}

/* 按钮暗黑模式 */
.dark .theme-toggle-btn,
.dark .action-btn {
  background: rgba(30, 41, 59, 0.8);
  border-color: #475569;
  color: #94a3b8;
}

.dark .theme-toggle-btn:hover,
.dark .action-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  border-color: #64748b;
  color: #e2e8f0;
}

.dark .refresh-btn {
  background: rgba(30, 41, 59, 0.8);
  border-color: #475569;
  color: #94a3b8;
}

.dark .refresh-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  border-color: #64748b;
  color: #e2e8f0;
}

.dark .refresh-btn__track {
  stroke: rgba(75, 85, 99, 0.6);
}

.dark .refresh-btn__bar {
  stroke: #60a5fa;
}

/* 表格暗黑模式 */
.dark .fund-table-shell {
  background: #0f172a;
}

.dark .fund-table__scroller {
  background: #0f172a;
  scrollbar-color: rgba(75, 85, 99, 0.6) transparent;
}

.dark .fund-table__scroller::-webkit-scrollbar-thumb {
  background: rgba(75, 85, 99, 0.6);
}

.dark .fund-table__header {
  background: #1e293b;
  border-bottom-color: #475569;
  color: #94a3b8;
}

.dark .fund-table__body-row {
  border-bottom-color: rgba(51, 65, 85, 0.5);
}

.dark .fund-table__body-row:nth-child(2n) {
  background: transparent;
}

.dark .fund-table__body-row:hover {
  background: transparent;
}

.dark .fund-table__cell--sticky {
  background: #0f172a;
}

.dark .fund-table__cell--sticky::after {
  background: rgba(51, 65, 85, 0.5);
}

.dark .fund-table__header .fund-table__cell--sticky {
  background: #1e293b;
}

.dark .fund-table__cell--pressing {
  background: rgba(127, 29, 29, 0.3);
}

.dark .fund-table__name {
  color: #e2e8f0;
}

.dark .fund-table__sub {
  color: #64748b;
}

.dark .fund-table__error {
  color: #f87171;
}

.dark .fund-table__value--estimate {
  color: #e2e8f0;
}

.dark .fund-table__sort-arrow {
  color: #475569;
}

.dark .fund-table__sort-arrow--active {
  color: #60a5fa;
}

.dark .fund-table__sort-header:hover .fund-table__sort-arrow {
  color: #64748b;
}

.dark .fund-table__cell--sortable:hover {
  color: #60a5fa;
}

/* 搜索面板暗黑模式 */
.dark .search-modal {
  background: rgba(0, 0, 0, 0.6);
}

.dark .search-panel {
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.99) 24%), #0f172a;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
}

.dark .search-panel__title {
  color: #f1f5f9;
}

.dark .search-panel__subtitle {
  color: #64748b;
}

.dark .search-panel__close {
  background: rgba(51, 65, 85, 0.75);
  color: #94a3b8;
}

.dark .search-panel__close:hover {
  background: rgba(71, 85, 105, 0.9);
  color: #e2e8f0;
}

.dark .search-input__icon {
  color: #64748b;
}

.dark .search-input {
  border-color: #475569;
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
}

.dark .search-input::placeholder {
  color: #64748b;
}

.dark .search-input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
}

.dark .search-status {
  color: #64748b;
}

.dark .search-status--error {
  color: #f87171;
}

.dark .search-result {
  border-bottom-color: #334155;
}

.dark .search-result:hover {
  background: rgba(51, 65, 85, 0.5);
}

.dark .search-result__name {
  color: #f1f5f9;
}

.dark .search-result__meta {
  color: #64748b;
}

.dark .search-result__nav {
  color: #60a5fa;
}

.dark .search-result__nav-date {
  color: #64748b;
}

/* 设置面板暗黑模式 */
.dark .settings-panel {
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.99) 24%), #0f172a;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
}

.dark .settings-section__title {
  color: #f1f5f9;
}

.dark .settings-section__desc {
  color: #64748b;
}

.dark .settings-divider {
  background: #334155;
}

.dark .settings-btn--primary {
  background: #2563eb;
}

.dark .settings-btn--primary:hover {
  background: #1d4ed8;
}

.dark .settings-btn--secondary {
  background: #334155;
  color: #e2e8f0;
  border-color: #475569;
}

.dark .settings-btn--secondary:hover {
  background: #475569;
}

.dark .settings-message--error {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
}

.dark .settings-message--success {
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
}

/* 删除对话框暗黑模式 */
.dark .dialog-backdrop {
  background: rgba(0, 0, 0, 0.6);
}

.dark .dialog-card {
  background: #1e293b;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}

.dark .dialog-card__title {
  color: #f1f5f9;
}

.dark .dialog-card__text {
  color: #94a3b8;
}

.dark .dialog-btn--ghost {
  background: #334155;
  color: #e2e8f0;
}

.dark .dialog-btn--ghost:hover {
  background: #475569;
}

/* 空状态暗黑模式 */
.dark .empty-state__hint {
  color: #64748b;
}

/* 文字颜色适配 */
.dark .text-gray-400 {
  color: #64748b;
}

.dark .text-blue-500 {
  color: #60a5fa;
}

.dark .text-red-600 {
  color: #f87171;
}

.dark .text-green-600 {
  color: #4ade80;
}

/* 聚焦状态 */
.dark .refresh-btn:focus-visible,
.dark .action-btn:focus-visible,
.dark .theme-toggle-btn:focus-visible,
.dark .banner-btn:focus-visible,
.dark .search-panel__close:focus-visible,
.dark .search-result:focus-visible,
.dark .search-input:focus-visible {
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.3);
}
</style>
