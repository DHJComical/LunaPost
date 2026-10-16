<template>
  <q-select
    class="string-option-select"
    :model-value="normalizedValue"
    :options="availableOptions"
    :multiple="multiple"
    :use-chips="multiple"
    use-input
    clearable
    options-dense
    behavior="menu"
    new-value-mode="add-unique"
    outlined
    :label="label"
    :hint="hint"
    @update:model-value="update"
  >
    <template #option="scope">
      <q-item v-bind="scope.itemProps">
        <q-item-section v-if="multiple" side>
          <q-checkbox class="no-pointer-events" :model-value="scope.selected" dense tabindex="-1" aria-hidden="true" />
        </q-item-section>
        <q-item-section><q-item-label>{{ scope.opt }}</q-item-label></q-item-section>
      </q-item>
    </template>
    <template #no-option>
      <q-item><q-item-section class="text-grey-7">{{ emptyLabel }}</q-item-section></q-item>
    </template>
  </q-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string | string[] | null
  options: string[]
  label: string
  hint?: string
  emptyLabel?: string
  multiple?: boolean
}>(), { multiple: false })
const emit = defineEmits<{ 'update:modelValue': [string | string[]] }>()

const selectedValues = computed(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : []
  return typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : []
})
const normalizedValue = computed(() => props.multiple ? selectedValues.value : (typeof props.modelValue === 'string' ? props.modelValue : ''))
const availableOptions = computed(() => [...new Set([...props.options, ...selectedValues.value])])

const update = (value: unknown) => {
  if (props.multiple) {
    emit('update:modelValue', Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
    return
  }
  emit('update:modelValue', typeof value === 'string' ? value : '')
}
</script>

<style scoped>
.string-option-select { width: 100%; min-width: 0; }
</style>
