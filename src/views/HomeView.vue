<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

// 基金估值数据（仅查询，无持仓）
const funds = ref([
  {
    code: '519732',
    name: '交银趋势混合A',
    estimate: 3.5123,
    growth: 1.61,
  },
  {
    code: '161725',
    name: '招商白酒指数',
    estimate: 1.1987,
    growth: -2.90,
  },
  {
    code: '005827',
    name: '易方达蓝筹精选',
    estimate: 2.1890,
    growth: 1.50,
  },
  {
    code: '003096',
    name: '中欧医疗健康A',
    estimate: 2.7567,
    growth: -1.16,
  },
  {
    code: '002190',
    name: '农银新能源主题',
    estimate: 3.2456,
    growth: 3.91,
  },
])

const lastUpdated = ref('14:32:15')

// 自动刷新进度
const refreshProgress = ref(0)
const REFRESH_INTERVAL = 30000 // 30秒
let progressInterval: ReturnType<typeof setInterval> | null = null
const isRefreshing = ref(false)

// 启动自动刷新进度条
function startProgress() {
  refreshProgress.value = 0
  if (progressInterval) clearInterval(progressInterval)
  progressInterval = setInterval(() => {
    refreshProgress.value += 100 / (REFRESH_INTERVAL / 100)
    if (refreshProgress.value >= 100) {
      refreshProgress.value = 100
      doRefresh()
    }
  }, 100)
}

// 执行刷新
function doRefresh() {
  isRefreshing.value = true
  // 模拟刷新数据
  funds.value.forEach(fund => {
    const change = (Math.random() - 0.5) * 0.5
    fund.estimate = fund.estimate * (1 + change / 100)
    fund.growth = fund.growth + change
  })
  lastUpdated.value = new Date().toLocaleTimeString('zh-CN')
  startProgress() // 重新开始进度条
  window.setTimeout(() => {
    isRefreshing.value = false
  }, 500)
}

// 手动点击刷新
function manualRefresh() {
  doRefresh()
}

onMounted(() => {
  startProgress()
})

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval)
  progressInterval = null
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 顶部导航 -->
    <header class="bg-white shadow-sm sticky top-0 z-10">
      <div class="container h-14 flex items-center justify-between px-4">
        <h1 class="text-xl font-bold text-blue-600">
          FundLite
        </h1>
        <!-- 刷新按钮 -->
        <button
          type="button"
          class="refresh-btn"
          aria-label="刷新"
          :style="{ '--progress': refreshProgress }"
          @click="manualRefresh"
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
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 主要内容 -->
    <main class="content-wrapper">
      <!-- 更新时间 -->
      <div class="flex-between items-center mb-4 px-1">
        <span class="text-xs text-gray-400">更新于 {{ lastUpdated }}</span>
      </div>

      <!-- 基金列表 -->
      <div class="space-y-3">
        <div v-for="fund in funds" :key="fund.code"
          class="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div class="flex-between items-center">
            <!-- 左侧：基金信息 -->
            <div class="flex-1 min-w-0 mr-3">
              <h3 class="text-base font-semibold text-gray-900 truncate">
                {{ fund.name }}
              </h3>
              <div class="text-xs text-gray-400 mt-0.5">
                {{ fund.code }} · {{ fund.estimate.toFixed(4) }}
              </div>
            </div>

            <!-- 右侧：涨跌幅 -->
            <div :class="[
              'text-base font-bold tabular-nums',
              fund.growth >= 0 ? 'text-red-500' : 'text-green-500'
            ]">
              {{ fund.growth >= 0 ? '+' : '' }}{{ fund.growth.toFixed(2) }}%
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="funds.length === 0" class="text-center py-20">
        <div class="i-carbon-search text-6xl text-gray-200 mx-auto mb-4"></div>
        <p class="text-gray-400 mb-6">还没有添加基金</p>
        <button class="btn-primary">
          <div class="i-carbon-add text-lg mr-2"></div>
          添加基金
        </button>
      </div>

      <!-- 提示文字 -->
      <div class="text-center text-xs text-gray-400 mt-6">
        数据仅供参考，实际以基金公司披露为准
      </div>
    </main>
  </div>
</template>

<style scoped>
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
  color: #2563eb; /* blue-600 */
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.refresh-btn:hover {
  background: #f9fafb; /* gray-50 */
}

.refresh-btn:active {
  background: #f3f4f6; /* gray-100 */
}

.refresh-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

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
  stroke: rgba(229, 231, 235, 0.95); /* gray-200 */
}

.refresh-btn:hover .refresh-btn__track {
  stroke: rgba(209, 213, 219, 0.95); /* gray-300 */
}

.refresh-btn__bar {
  stroke: #60a5fa; /* blue-400 */
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
</style>
