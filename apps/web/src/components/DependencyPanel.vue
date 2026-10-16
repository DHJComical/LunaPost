<template>
  <section class="q-my-lg">
    <h2 class="text-h6">{{ t('dependencyPanel.dependenciesAndInstallationPlan') }}</h2>
    <div class="row q-col-gutter-sm">
      <q-select v-model="versionId" class="col-12 col-md-4" :options="project.versions.map(v => ({ label: `${v.version} · ${v.loaders.join('/')} · ${v.gameVersions.join('/')}`, value: v.id }))" emit-value map-options outlined dense :label="t('dependencyPanel.release')" />
      <q-select v-model="loader" class="col-6 col-md-2" :options="[...(version?.loaders || []),...(version?.loaderBridges || []).map(b => b.toLoader)]" outlined dense :label="t('dependencyPanel.loader')" />
      <q-select v-model="gameVersion" class="col-6 col-md-2" :options="version?.gameVersions || []" outlined dense :label="t('dependencyPanel.gameVersion')" />
      <q-select v-model="side" class="col-6 col-md-2" :options="sideOptions" emit-value map-options outlined dense :label="t('dependencyPanel.side')" />
      <q-input v-model="loaderVersion" class="col-6 col-md-2" outlined dense :label="t('dependencyPanel.loaderVersion')" />
      <q-input v-model="installed" class="col-12 col-md-6" outlined dense :label="t('dependencyPanel.installedVersionIDsCommaSeparated')" />
      <q-input v-model="features" class="col-12 col-md-6" outlined dense :label="t('dependencyPanel.enabledFeaturesCommaSeparated')" />
    </div>
    <q-list separator class="q-my-md"><q-item v-for="(d,i) in version?.dependencies" :key="d.id || i"><q-item-section>
      <q-item-label>{{ relation(d.dependencyType) }} · {{ d.external ? `${d.external.provider}: ${d.external.projectId}` : d.projectId || d.versionId || d.fileName }}</q-item-label>
      <q-item-label caption>{{ constraint(d) }} {{ d.reason }} {{ d.appliesTo ? JSON.stringify(d.appliesTo) : '' }} {{ d.when ? JSON.stringify(d.when) : '' }}</q-item-label>
    </q-item-section><q-item-section side v-if="['optional','recommended'].includes(d.dependencyType)"><q-checkbox v-model="optional" :val="d.id || (d.external ? externalProjectId(d.external) : d.projectId || d.versionId)" :label="t('dependencyPanel.install')" /></q-item-section></q-item></q-list>
    <q-btn outline color="primary" :loading="loading" :disable="!version || !loader || !gameVersion" :label="t('dependencyPanel.resolveDependencies')" @click="resolve" />
    <q-banner v-if="error" class="q-my-sm" role="alert">{{ error }}</q-banner>
    <template v-if="result">
      <q-banner v-for="(p,i) in [...result.errors,...result.warnings]" :key="i" class="q-my-sm">{{ p.code }}: {{ p.message }} — {{ p.path.join(' → ') }}</q-banner>
      <q-tree v-if="tree.length" :nodes="tree" node-key="key" default-expand-all class="q-my-md" />
      <q-list separator><q-item v-for="node in result.nodes" :key="node.versionId"><q-item-section><a v-if="node.externalUrl" :href="node.externalUrl" target="_blank" rel="noopener noreferrer">{{ node.title }} · {{ node.version }}</a><router-link v-else :to="`/projects/${node.slug}`">{{ node.title }} · {{ node.version }}</router-link><small v-if="node.bridge">{{ node.bridge.fromLoader }} → {{ node.bridge.toLoader }} · {{ node.bridge.viaProjectId }}</small></q-item-section><q-item-section side><q-select v-model="fileSelections[node.versionId]" :options="node.files.map(f => ({ label: f.name, value: f.id }))" emit-value map-options outlined dense :label="t('dependencyPanel.selectFile')" @update:model-value="resolve" /></q-item-section></q-item></q-list>
      <q-list><q-item v-for="edge in result.edges.filter(e => e.active && ['optional','recommended'].includes(e.dependency.dependencyType))" :key="edge.from + (edge.to || edge.dependency.id)"><q-item-section>{{ edge.from }} → {{ edge.to }} · {{ relation(edge.dependency.dependencyType) }}</q-item-section><q-item-section side><q-checkbox v-model="optional" :val="edge.dependency.id || edge.to" :label="t('dependencyPanel.install')" @update:model-value="resolve" /></q-item-section></q-item></q-list>
      <q-btn class="q-mt-sm" color="primary" icon="download" :disable="!result.installable || dirty" :label="t('dependencyPanel.exportInstallationPlan')" @click="download" />
    </template>
    <q-expansion-item v-if="dependents.length" :label="t('dependencyPanel.dependentReleases')"><q-list><q-item v-for="d in dependents" :key="d.versionId" clickable :to="`/projects/${d.slug}`"><q-item-section>{{ d.title }} · {{ d.version }}</q-item-section></q-item></q-list></q-expansion-item>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { externalProjectId, dependencyRequestSchema, resolveDependencies, catalogSchema, type Project, type Dependency } from '@andrea/contracts'
import { resolveRemote, type Resolution } from '../lib/dependencies'
import { useI18n } from '../i18n'
import { getAccessToken } from '../lib/auth'
const props = defineProps<{ project: Project; preview?: boolean }>()
const { t, locale } = useI18n()
const relation = (type: string) => ({ required: t('common.required'), optional: t('common.optional'), recommended: t('dependencyType.recommended'), integration: t('dependencyType.integration'), incompatible: t('dependencyType.incompatible'), embedded: t('dependencyType.embedded') }[type] || type)
const sideOptions = computed(() => [{ label: t('discover.client'), value: 'client' }, { label: t('discover.server'), value: 'server' }])
const constraint = (d:Dependency) => d.external?.versionId || d.versionId || (d.versionConstraint?.scheme === 'semver' ? d.versionConstraint.range : d.versionConstraint?.versions.join(', ')) || '*'
const versionId = ref(''); const loader = ref(''); const gameVersion = ref(''); const side = ref<'client'|'server'>('client'); const loaderVersion = ref(''); const installed = ref(''); const features = ref(''); const optional = ref<string[]>([]); const fileSelections = ref<Record<string,string>>({}); const loading = ref(false); const error = ref(''); const result = ref<Resolution>(); const dirty = ref(true)
const version = computed(() => props.project.versions.find(v => v.id === versionId.value))
watch(() => props.project, () => { if (!props.project.versions.some(v => v.id === versionId.value)) versionId.value = props.project.versions[0]?.id || '' }, { immediate:true })
watch(version, v => { loader.value = v?.loaders[0] || ''; gameVersion.value = v?.gameVersions[0] || ''; optional.value = []; result.value = undefined }, { immediate:true })
watch([versionId,loader,gameVersion,side,loaderVersion,installed,features,optional,fileSelections, () => props.project], () => dirty.value = true, { deep:true, flush:'sync' })
const csv = (v:string) => v.split(',').map(s => s.trim()).filter(Boolean)
const request = () => dependencyRequestSchema.parse({ versionId: versionId.value, loader: loader.value, gameVersion: gameVersion.value, side: side.value, loaderVersion: loaderVersion.value || undefined, installedVersions: csv(installed.value), enabledFeatures: csv(features.value), selectedOptionalDependencies: optional.value, fileSelections: fileSelections.value })
let resolutionSequence = 0
const resolve = async () => { const sequence = ++resolutionSequence; loading.value = true; error.value = ''; try {
  const input = request(); const snapshot = JSON.stringify(input)
  let resolved: Resolution
  if (import.meta.env.VITE_STATIC_MODE === 'true') {
    const response = await fetch(import.meta.env.VITE_STATIC_MODE === 'true' ? '/catalog.json' : `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/catalog`, { credentials:'include', headers: { 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) } })
    if (!response.ok) throw new Error('Catalog unavailable')
    const catalog = catalogSchema.parse(await response.json()); catalog.projects = [...catalog.projects.filter(p => p.id !== props.project.id),props.project]
    resolved = resolveDependencies(catalog,input)
  } else resolved = await resolveRemote(input, props.preview ? props.project : undefined)
  if (sequence !== resolutionSequence) return
  result.value = resolved
  dirty.value = snapshot !== JSON.stringify(request())
} catch(e) { if (sequence === resolutionSequence) { error.value = String(e); result.value = undefined } } finally { if (sequence === resolutionSequence) loading.value = false } }
type Tree = { key:string; label:string; children?:Tree[] }
const tree = computed(() => {
  if (!result.value?.success) return []
  const nodes = new Map(result.value.nodes.map(n => [n.projectId,n])); let count = 0
  const build = (id:string, path:string[]):Tree => {
    const n = nodes.get(id); const cycle = path.includes(id); const key = `${count++}-${id}`
    return { key, label: `${n?.title || id}${n ? ` · ${n.version}` : ''}${cycle ? ' ↩' : ''}`, children: cycle || count > 200 ? [] : result.value!.edges.filter(e => e.from === id && e.active && e.to && nodes.has(e.to) && !['incompatible','integration','embedded'].includes(e.dependency.dependencyType)).map(e => build(e.to!,[...path,id])) }
  }
  return [build(props.project.id,[])]
})
const download = () => { if (!result.value?.installable || dirty.value) return; const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion:1, environment:request(), ...result.value },null,2)],{type:'application/json'})); const a = document.createElement('a'); a.href=url; a.download=`${props.project.slug}-dependencies.json`; a.click(); URL.revokeObjectURL(url) }
const dependents = ref<Array<{ title:string; slug:string; version:string; versionId:string }>>([])
onMounted(async () => { if (props.preview || import.meta.env.VITE_STATIC_MODE === 'true') return; try { const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/projects/${encodeURIComponent(props.project.slug)}/dependents`, { credentials:'include', headers: { 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) } }); if(response.ok) dependents.value = (await response.json()).dependents } catch { /* optional reverse index */ } })
</script>
