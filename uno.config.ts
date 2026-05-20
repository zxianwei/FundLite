import { defineConfig, presetUno, presetAttributify, presetIcons, transformerDirectives } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(), // 默认预设，包含 Tailwind 类
    presetAttributify(), // 属性化模式支持
    presetIcons(), // 图标支持
  ],
  transformers: [
    transformerDirectives(), // @apply 指令支持
  ],
  // 响应式断点配置（移动端优先）
  theme: {
    breakpoints: {
      'xs': '320px',      // 超小屏手机
      'sm': '640px',      // 大屏手机/小屏平板
      'md': '768px',      // 平板
      'lg': '1024px',     // 小屏笔记本
      'xl': '1280px',     // 桌面显示器
      '2xl': '1536px',    // 大屏显示器
    },
  },
  // 自定义规则
  rules: [],
  // 快捷方式 - 常用响应式布局模式
  shortcuts: {
    // 基础布局
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'flex-col-center': 'flex flex-col items-center justify-center',

    // 响应式容器
    'container': 'w-full px-4 mx-auto sm:px-6 lg:px-8 xl:px-12',
    'container-sm': 'w-full px-4 mx-auto max-w-sm sm:max-w-md md:max-w-lg',
    'container-md': 'w-full px-4 mx-auto max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl',
    'container-lg': 'w-full px-4 mx-auto max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-6xl',

    // 响应式网格
    'grid-responsive-1': 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
    'grid-responsive-2': 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
    'grid-responsive-3': 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4',

    // 响应式文字
    'text-responsive-xs': 'text-xs sm:text-sm md:text-base',
    'text-responsive-sm': 'text-sm sm:text-base md:text-lg',
    'text-responsive-base': 'text-base sm:text-lg md:text-xl',
    'text-responsive-lg': 'text-lg sm:text-xl md:text-2xl lg:text-3xl',
    'text-responsive-xl': 'text-xl sm:text-2xl md:text-3xl lg:text-4xl',

    // 响应式内边距
    'p-responsive': 'p-3 sm:p-4 md:p-6 lg:p-8',
    'px-responsive': 'px-3 sm:px-4 md:px-6 lg:px-8',
    'py-responsive': 'py-3 sm:py-4 md:py-6 lg:py-8',

    // 安全区域（刘海屏适配）
    'safe-top': 'pt-[env(safe-area-inset-top)]',
    'safe-bottom': 'pb-[env(safe-area-inset-bottom)]',
    'safe-area': 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',

    // 卡片样式
    'card': 'bg-white rounded-lg shadow-sm p-4 sm:p-6',
    'card-hover': 'bg-white rounded-lg shadow-sm p-4 sm:p-6 transition-shadow hover:shadow-md',

    // 按钮样式
    'btn': 'px-4 py-2 rounded-lg transition-colors duration-200',
    'btn-primary': 'px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-200',
    'btn-lg': 'px-6 py-3 sm:px-8 sm:py-4 rounded-lg text-base sm:text-lg',

    // 页面布局
    'page-container': 'min-h-screen w-full bg-gray-50',
    'content-wrapper': 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8',

    // 响应式显示/隐藏
    'mobile-only': 'block sm:hidden',
    'tablet-only': 'hidden md:block lg:hidden',
    'desktop-only': 'hidden lg:block',
    'mobile-hidden': 'hidden sm:block',
    'tablet-hidden': 'block md:hidden lg:block',
  },
})
