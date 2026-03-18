<script setup lang="ts">
import { onMounted, ref } from 'vue'

export interface FeatureItem {
  title: string
  desc: string
}

interface Props {
  version: string
  title?: string
  features: FeatureItem[]
  confirmText?: string
  debug?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '新功能上线',
  confirmText: '知道了',
  debug: false,
})

const show = ref(false)
const STORAGE_KEY = 'feature-version'

onMounted(() => {
  // 调试模式：每次都显示
  if (props.debug) {
    show.value = true
    return
  }

  const lastVersion = localStorage.getItem(STORAGE_KEY)
  if (lastVersion !== props.version) {
    show.value = true
  }
})

function close() {
  show.value = false
  localStorage.setItem(STORAGE_KEY, props.version)
}
</script>

<template>
  <div v-if="show" class="feature-backdrop" @click.self="close">
    <div class="feature-card">
      <div class="feature-card__title">{{ title }}</div>
      <div class="feature-card__content">
        <ul class="feature-list">
          <li v-for="(item, index) in features" :key="index">
            <span class="feature-list__title">{{ item.title }}</span>
            <span class="feature-list__desc">{{ item.desc }}</span>
          </li>
        </ul>
      </div>
      <button type="button" class="feature-card__btn" @click="close">
        {{ confirmText }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.feature-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
}

.feature-card {
  width: min(100%, 380px);
  padding: 28px 24px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 251, 255, 0.96) 100%), #fff;
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.18),
    0 8px 24px rgba(15, 23, 42, 0.08);
  text-align: center;
}


.feature-card__title {
  color: #111827;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 20px;
}

.feature-card__content {
  text-align: left;
  margin-bottom: 24px;
}

.feature-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.feature-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
}

.feature-list li:first-child {
  padding-top: 0;
}

.feature-list li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.feature-list__title {
  color: #1e40af;
  font-size: 15px;
  font-weight: 600;
}

.feature-list__desc {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}

.feature-card__btn {
  width: 100%;
  height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease;
}

.feature-card__btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.feature-card__btn:active {
  transform: scale(0.98);
}

@media (max-width: 640px) {
  .feature-backdrop {
    padding: 16px;
  }

  .feature-card {
    padding: 24px 20px;
  }
}
</style>
