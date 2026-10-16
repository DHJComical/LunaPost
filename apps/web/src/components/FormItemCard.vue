<template>
  <q-card flat bordered class="form-item-card">
    <header v-if="title || description || $slots.actions" class="form-item-card__header">
      <div class="form-item-card__heading">
        <h3 v-if="title" class="form-item-card__title">{{ title }}</h3>
        <p v-if="description" class="form-item-card__description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="form-item-card__actions">
        <slot name="actions" />
      </div>
    </header>
    <q-separator v-if="title || description || $slots.actions" />
    <q-card-section class="form-item-card__body">
      <slot />
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
defineProps<{ title?: string; description?: string }>()
</script>

<style scoped>
.form-item-card { min-width: 0; overflow: visible; border-radius: var(--app-radius-md); color: var(--app-text); background: var(--app-surface); }
.form-item-card__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; }
.form-item-card__heading { min-width: 0; }
.form-item-card__title { margin: 0; color: var(--app-text); font-size: .95rem; font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; }
.form-item-card__description { margin: 3px 0 0; color: var(--app-muted); font-size: .8rem; line-height: 1.45; overflow-wrap: anywhere; }
.form-item-card__actions { display: flex; flex: 0 0 auto; align-items: center; flex-wrap: wrap; gap: var(--app-space-sm); }
.form-item-card__body { padding: 16px; }
@media (max-width: 600px) {
  .form-item-card__header { align-items: flex-start; flex-direction: column; }
  .form-item-card__actions { width: 100%; }
  .form-item-card__actions :deep(.q-file),
  .form-item-card__actions :deep(.q-btn:not(.q-btn--round)) { flex: 1 1 auto; max-width: 100%; }
  .form-item-card__actions :deep(.file-button) { flex: 1 1 auto; }
  .form-item-card__actions :deep(.file-button .q-btn) { width: 100%; }
}
</style>
