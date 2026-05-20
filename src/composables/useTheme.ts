import { ref, onMounted } from 'vue'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'fundlite-theme'

// 全局主题状态，确保跨组件同步
const theme = ref<Theme>('light')
const isReady = ref(false)

export function useTheme() {
  // 初始化主题
  const initTheme = () => {
    if (typeof window === 'undefined') return

    // 先检查本地存储
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null

    if (stored && (stored === 'light' || stored === 'dark')) {
      theme.value = stored
    } else {
      // 没有存储则检测系统偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      theme.value = prefersDark ? 'dark' : 'light'
    }

    applyTheme(theme.value)
    isReady.value = true
  }

  // 应用主题到 DOM
  const applyTheme = (newTheme: Theme) => {
    if (typeof document === 'undefined') return

    const root = document.documentElement

    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  // 切换主题
  const toggleTheme = () => {
    const newTheme: Theme = theme.value === 'light' ? 'dark' : 'light'
    theme.value = newTheme
    applyTheme(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }

  // 设置指定主题
  const setTheme = (newTheme: Theme) => {
    theme.value = newTheme
    applyTheme(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }

  // 监听系统主题变化
  onMounted(() => {
    initTheme()

    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      // 只有当用户没有手动设置过主题时才跟随系统
      const hasUserPreference = localStorage.getItem(STORAGE_KEY)
      if (!hasUserPreference) {
        const newTheme: Theme = e.matches ? 'dark' : 'light'
        theme.value = newTheme
        applyTheme(newTheme)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
  })

  return {
    theme,
    isReady,
    toggleTheme,
    setTheme,
    isDark: () => theme.value === 'dark',
  }
}
