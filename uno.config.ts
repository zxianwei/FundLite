import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(), // 默认预设，包含 Tailwind 类
    presetAttributify(), // 属性化模式支持
    presetIcons(), // 图标支持
  ],
  // 自定义规则
  rules: [],
  // 快捷方式
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
  },
})
