<template>
  <header class="section-heading">
    <div class="section-heading__copy">
      <h2 class="section-heading__title">{{ title }}</h2>
      <p v-if="description" class="section-heading__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="section-heading__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<style scoped>
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: var(--app-space-md, 16px); }
.section-heading__copy { min-width: 0; }
.section-heading__title { margin: 0; color: var(--app-text); font-size: 1.125rem; font-weight: 700; line-height: 1.45; }
.section-heading__description { margin: 4px 0 0; color: var(--app-muted); font-size: .875rem; line-height: 1.55; }
.section-heading__actions { display: flex; flex: 0 0 auto; align-items: center; flex-wrap: wrap; gap: var(--app-space-sm, 10px); }
@media (max-width: 600px) {
  .section-heading { flex-direction: column; gap: 12px; }
  .section-heading__actions { width: 100%; align-items: stretch; }
  .section-heading__actions :deep(.q-btn),
  .section-heading__actions :deep(.q-file) { flex: 1 1 auto; }
}
</style>
