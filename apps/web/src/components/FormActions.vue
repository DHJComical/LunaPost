<template>
  <div class="form-actions" :class="`form-actions--${align}`">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ align?: 'start' | 'center' | 'end' | 'between' }>(), { align: 'end' })
</script>

<style scoped>
.form-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--app-space-sm, 10px); min-width: 0; }
.form-actions--start { justify-content: flex-start; }
.form-actions--center { justify-content: center; }
.form-actions--end { justify-content: flex-end; }
.form-actions--between { justify-content: space-between; }
@media (max-width: 600px) {
  .form-actions { width: 100%; }
  .form-actions :deep(.q-btn) { flex: 1 1 auto; }
}
</style>
