import './assets/main.css'
import 'virtual:uno.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 版本检测：发现新版本自动刷新
async function checkVersionAndReload() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store'
    })
    const { version } = await res.json()
    const stored = localStorage.getItem('app-version')

    if (stored && stored !== version) {
      // 发现新版本，更新版本号并刷新
      localStorage.setItem('app-version', version)
      window.location.reload()
      return
    }

    localStorage.setItem('app-version', version)
  } catch {
    // 忽略错误，继续加载应用
  }
}

// 先检测版本，再挂载应用
checkVersionAndReload().then(() => {
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
})
