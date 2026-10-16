<template>
  <header class="app-page-header">
    <div class="app-page-header__copy">
      <div v-if="eyebrow" class="app-page-header__eyebrow">{{ eyebrow }}</div>
      <h1 class="app-page-header__title">{{ title }}</h1>
      <p v-if="description" class="app-page-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="app-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>

<style scoped>
.app-page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.app-page-header__copy { min-width: 0; }
.app-page-header__eyebrow { margin-bottom: 4px; color: var(--app-primary-strong); font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.app-page-header__title { margin: 0; color: var(--app-text); font-size: clamp(1.65rem, 3vw, 2rem); font-weight: 800; line-height: 1.2; letter-spacing: -.035em; }
.app-page-header__description { margin: 8px 0 0; color: var(--app-muted); font-size: .9rem; line-height: 1.55; }
.app-page-header__actions { display: flex; flex: 0 0 auto; align-items: center; flex-wrap: wrap; gap: var(--app-space-sm, 10px); }
@media (max-width: 650px) {
  .app-page-header { align-items: stretch; flex-direction: column; gap: 16px; }
  .app-page-header__actions { width: 100%; }
  .app-page-header__actions :deep(.q-btn) { flex: 1 1 auto; }
}
</style>
