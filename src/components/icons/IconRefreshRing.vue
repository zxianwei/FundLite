<script setup lang="ts">
defineProps<{ progress: number }>()
</script>

<template>
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
      :style="{ strokeDasharray: `${progress} 100` }"
    />
  </svg>
</template>
