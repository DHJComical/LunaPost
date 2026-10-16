<template>
  <div class="file-button">
    <q-btn :outline="outline" :color="color" :icon="icon" :label="label" @click="openPicker" />
    <input
      ref="input"
      class="file-button__input"
      type="file"
      :accept="accept"
      :multiple="multiple"
      tabindex="-1"
      aria-hidden="true"
      @change="selectFiles"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  label: string
  accept?: string
  multiple?: boolean
  icon?: string
  color?: string
  outline?: boolean
}>(), {
  multiple: false,
  icon: 'upload_file',
  color: 'primary',
  outline: true,
})
const emit = defineEmits<{ select: [files: File[]] }>()
const input = ref<HTMLInputElement | null>(null)

const openPicker = () => input.value?.click()
const selectFiles = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  if (files.length) emit('select', files)
  target.value = ''
}
</script>

<style scoped>
.file-button { display: inline-flex; min-width: 0; }
.file-button__input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
</style>
