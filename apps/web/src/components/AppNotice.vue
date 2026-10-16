<template>
  <q-banner rounded class="app-notice" :class="`app-notice--${tone}`">
    <template #avatar>
      <q-icon :name="icon" />
    </template>
    <slot />
  </q-banner>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ tone?: 'error' | 'warning' | 'info' | 'success'; icon?: string }>(), { tone: 'info' })
const icon = computed(() => props.icon ?? ({ error: 'error_outline', warning: 'warning_amber', info: 'info_outline', success: 'check_circle_outline' }[props.tone]))
</script>

<style scoped>
.app-notice { border: 1px solid transparent; border-radius: var(--app-radius-md); line-height: 1.55; }
.app-notice--error { border-color: var(--app-danger-border); color: var(--app-danger); background: var(--app-danger-bg); }
.app-notice--warning { border-color: var(--app-warning-border); color: var(--app-warning); background: var(--app-warning-bg); }
.app-notice--info { border-color: var(--app-info-border); color: var(--app-info); background: var(--app-info-bg); }
.app-notice--success { border-color: var(--app-success-border); color: var(--app-success); background: var(--app-success-bg); }
</style>
