<script setup lang="ts">
import { ref } from 'vue'

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
  // 模拟刷新数据
  funds.value.forEach(fund => {
    const change = (Math.random() - 0.5) * 0.5
    fund.estimate = fund.estimate * (1 + change / 100)
    fund.growth = fund.growth + change
  })
  lastUpdated.value = new Date().toLocaleTimeString('zh-CN')
  startProgress() // 重新开始进度条
}

// 手动点击刷新
function manualRefresh() {
  doRefresh()
}

// 启动自动刷新
startProgress()
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
        <button @click="manualRefresh" class="relative w-8 h-8 flex items-center justify-center rounded-lg bg-white">
          <!-- 底部边框(浅灰色) -->
          <div class="absolute inset-0 rounded-lg border"></div>
          <!-- 进度边框(浅蓝色) - 使用 clip-path 实现左边进度效果 -->
          <div class="absolute inset-0 rounded-lg border-2 border-blue-400 transition-all duration-100" :style="{
            clipPath: `inset(0 ${100 - refreshProgress}% 0 0)`
          }"></div>
          <!-- 刷新图标 -->
          <svg class="w-4 h-4 text-blue-600 relative z-10" :class="{ 'animate-spin': refreshProgress >= 100 }"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
