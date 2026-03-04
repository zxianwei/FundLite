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
const isRefreshing = ref(false)

// 刷新数据（模拟）
function refresh() {
  isRefreshing.value = true
  setTimeout(() => {
    funds.value.forEach(fund => {
      const change = (Math.random() - 0.5) * 0.5
      fund.estimate = fund.estimate * (1 + change / 100)
      fund.growth = fund.growth + change
    })
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN')
    isRefreshing.value = false
  }, 800)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20 sm:pb-0">
    <!-- 顶部导航 -->
    <header class="bg-white shadow-sm sticky top-0 z-10">
      <div class="container h-14 flex-between">
        <h1 class="text-xl font-bold text-blue-600">
          FundLite
        </h1>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">
            {{ lastUpdated }}
          </span>
          <button @click="refresh"
            :class="['p-2 rounded-full hover:bg-gray-100 transition-transform', { 'animate-spin': isRefreshing }]">
            <div class="i-carbon-renew text-lg text-gray-600"></div>
          </button>
          <button class="btn-primary text-sm px-3 py-1.5">
            <div class="i-carbon-add text-lg mr-1"></div>
            添加
          </button>
        </div>
      </div>
    </header>

    <!-- 主要内容 -->
    <main class="content-wrapper">
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

    <!-- 移动端悬浮添加按钮 -->
    <button
      class="mobile-only fixed right-4 bottom-6 w-12 h-12 bg-blue-500 text-white rounded-full shadow-lg flex-center active:scale-95 transition-transform">
      <div class="i-carbon-add text-xl"></div>
    </button>
  </div>
</template>
