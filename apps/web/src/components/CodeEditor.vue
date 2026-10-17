<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useTheme } from '../theme'
import { useMonacoEditor } from '../editorPreferences'
import { useI18n } from '../i18n'

type Language = 'json' | 'html' | 'markdown' | 'css' | 'javascript' | 'plaintext'
const props = withDefaults(defineProps<{ modelValue: string; language?: Language; label?: string; height?: string; readonly?: boolean; error?: boolean; errorMessage?: string }>(), { language: 'plaintext', height: '360px', readonly: false, error: false, errorMessage: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const host = ref<HTMLElement | null>(null)
const fullscreen = ref(false)
let editor: monaco.editor.IStandaloneCodeEditor | undefined
let changeListener: monaco.IDisposable | undefined
const { isDark } = useTheme()
const { t } = useI18n()
const monacoEnabled = useMonacoEditor

if (typeof globalThis !== 'undefined' && !(globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment) {
  // Monaco sends language-service requests through the worker selected by this
  // callback. Using editor.worker for every label makes JSON/CSS/HTML features
  // call handlers that the generic worker does not provide.
  ;(globalThis as typeof globalThis & { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker: (_moduleId: string, label: string) => {
      if (label === 'json') return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' })
      if (label === 'css' || label === 'scss' || label === 'less') return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' })
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' })
      if (label === 'typescript' || label === 'javascript') return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' })
      return new Worker(new URL('../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
    },
  } as monaco.Environment
}
const theme = () => isDark.value ? 'vs-dark' : 'vs'
const format = async () => {
  if (!editor) return
  if (props.language === 'json') {
    try { editor.setValue(JSON.stringify(JSON.parse(editor.getValue()), null, 2)); return } catch { /* let Monaco attempt formatting for an incomplete document */ }
  }
  const action = editor.getAction('editor.action.formatDocument')
  if (action) {
    try { await action.run(); return } catch { /* use the local JSON formatter below */ }
  }
}
const toggleFullscreen = () => { fullscreen.value = !fullscreen.value; requestAnimationFrame(() => editor?.layout()) }
onMounted(() => {
  if (!host.value) return
  editor = monaco.editor.create(host.value, { value: props.modelValue, language: props.language, theme: theme(), automaticLayout: true, minimap: { enabled: false }, wordWrap: 'on', fontSize: 13, tabSize: 2, formatOnPaste: true, formatOnType: true, scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 }, readOnly: props.readonly, roundedSelection: true })
  editor.addAction({ id: 'andrea.format-document', label: t('codeEditor.formatDocument'), keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], contextMenuGroupId: 'modification', contextMenuOrder: 0, run: () => format() })
  changeListener = editor.onDidChangeModelContent(() => emit('update:modelValue', editor?.getValue() ?? ''))
})
watch(() => props.modelValue, (value) => { if (editor && value !== editor.getValue()) editor.setValue(value) })
watch(() => props.language, (language) => { if (editor) monaco.editor.setModelLanguage(editor.getModel()!, language) })
watch(isDark, (dark) => { monaco.editor.setTheme(dark ? 'vs-dark' : 'vs') })
onBeforeUnmount(() => { changeListener?.dispose(); editor?.dispose() })
</script>

<template>
  <div v-if="!monacoEnabled" class="fallback-editor">
    <q-input :model-value="modelValue" outlined type="textarea" autogrow :label="label" :error="error" :error-message="errorMessage" input-style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace; min-height: 180px" @update:model-value="value => emit('update:modelValue', String(value))" />
  </div>
  <div v-else class="code-editor" :class="{ 'code-editor--fullscreen': fullscreen, 'code-editor--error': error }">
    <div class="code-editor__toolbar">
      <span v-if="label" class="text-caption text-weight-medium">{{ label }}</span>
      <q-space />
      <q-btn flat dense round icon="auto_fix_high" size="sm" :aria-label="t('codeEditor.format')" @click="format"><q-tooltip>{{ t('codeEditor.formatTooltip') }}</q-tooltip></q-btn>
      <q-btn flat dense round :icon="fullscreen ? 'fullscreen_exit' : 'fullscreen'" size="sm" :aria-label="t('codeEditor.fullscreen')" @click="toggleFullscreen"><q-tooltip>{{ t('codeEditor.fullscreen') }}</q-tooltip></q-btn>
    </div>
    <div ref="host" class="code-editor__host" :style="{ height: fullscreen ? 'calc(100vh - 58px)' : height }" />
    <div v-if="error && errorMessage" class="text-negative text-caption q-px-sm q-pb-xs">{{ errorMessage }}</div>
  </div>
</template>

<style scoped>
.code-editor { --editor-border: var(--app-border, #d9dee8); --editor-surface: var(--app-surface, #fff); --editor-muted: var(--app-muted, #667085); --editor-radius: var(--app-radius-md, 12px); overflow: hidden; min-width: 0; border: 1px solid var(--editor-border); border-radius: var(--editor-radius); background: var(--editor-surface); color: var(--app-text, #152033); box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
.code-editor__toolbar { min-height: 42px; display: flex; align-items: center; padding: 0 6px 0 14px; border-bottom: 1px solid var(--editor-border); background: color-mix(in srgb, var(--editor-surface) 92%, var(--app-text, #152033)); color: var(--app-text, #152033); }
.code-editor__toolbar .q-btn { color: var(--editor-muted); }
.code-editor__toolbar .q-btn:hover { color: var(--app-text, #152033); background: color-mix(in srgb, var(--app-text, #152033) 10%, transparent); }
.code-editor__host { width: 100%; min-width: 0; background: var(--editor-surface); }
.code-editor__host :deep(.monaco-editor), .code-editor__host :deep(.monaco-editor .overflow-guard) { border-radius: 0 0 var(--editor-radius) var(--editor-radius); }
.code-editor--fullscreen { position: fixed; z-index: 7000; inset: 0; width: 100vw; height: 100vh; border-radius: 0; background: var(--editor-surface); }
.code-editor--fullscreen .code-editor__host :deep(.monaco-editor), .code-editor--fullscreen .code-editor__host :deep(.monaco-editor .overflow-guard) { border-radius: 0; }
.code-editor--error { border-color: var(--q-negative); }
.fallback-editor { min-width: 0; }
@media (max-width: 600px) { .code-editor__toolbar { min-height: 40px; } }
@media (max-width: 600px) { .code-editor__host { height: min(360px, 58vh) !important; } }
</style>
