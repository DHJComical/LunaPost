<template>
  <section class="app-empty-state" role="status">
    <q-icon class="app-empty-state__icon" :name="icon" aria-hidden="true" />
    <h2 class="app-empty-state__title">{{ title }}</h2>
    <p v-if="description" class="app-empty-state__description">{{ description }}</p>
    <div v-if="$slots.actions" class="app-empty-state__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; icon?: string }>(), { icon: 'inbox' })
</script>

<style scoped>
.app-empty-state { display: flex; min-height: 230px; flex-direction: column; align-items: center; justify-content: center; padding: 36px 24px; border: 1px solid var(--app-border); border-radius: var(--app-radius-lg); color: var(--app-text); background: var(--app-surface); text-align: center; }
.app-empty-state__icon { color: var(--app-muted); font-size: 48px; }
.app-empty-state__title { margin: 14px 0 0; color: var(--app-text); font-size: 1.125rem; font-weight: 700; line-height: 1.4; }
.app-empty-state__description { max-width: 460px; margin: 8px 0 0; color: var(--app-muted); font-size: .9rem; line-height: 1.6; }
.app-empty-state__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--app-space-sm, 10px); margin-top: 18px; }
</style>
