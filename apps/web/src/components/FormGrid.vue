<template>
  <div class="form-grid" :class="`form-grid--${columns}`">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ columns?: 1 | 2 | 3 }>(), { columns: 2 })
</script>

<style scoped>
.form-grid { display: grid; align-items: start; gap: var(--app-space-md, 16px) 20px; min-width: 0; }
.form-grid--1 { grid-template-columns: minmax(0, 1fr); }
.form-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
:slotted(.q-field) { width: 100%; min-width: 0; }
:slotted(.form-grid__full) { grid-column: 1 / -1; min-width: 0; }
:slotted(.form-grid__wide) { grid-column: span 2; min-width: 0; }
@media (max-width: 900px) {
  .form-grid--3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .form-grid--2,
  .form-grid--3 { grid-template-columns: minmax(0, 1fr); }
  :slotted(.form-grid__wide) { grid-column: 1 / -1; }
}
</style>
