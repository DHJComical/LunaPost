<template>
  <section class="form-section">
    <SectionHeading :title="title" :description="description">
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </SectionHeading>
    <div class="form-section__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import SectionHeading from './SectionHeading.vue'

defineProps<{ title: string; description?: string }>()
</script>

<style scoped>
.form-section { min-width: 0; }
.form-section__body { display: grid; gap: 16px; min-width: 0; }
.form-section + .form-section { margin-top: var(--app-space-xl, 24px); padding-top: var(--app-space-xl, 24px); border-top: 1px solid var(--app-border); }
</style>
