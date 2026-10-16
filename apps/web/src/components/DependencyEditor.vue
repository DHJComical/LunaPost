<template>
  <FormSection :title="label('依赖与联动', 'Dependencies and integrations')" :description="label('声明项目依赖、可选组件和跨加载器桥接。', 'Declare project dependencies, optional components, and cross-loader bridges.')">
    <template #actions><q-btn flat dense color="primary" icon="add" :label="label('添加依赖', 'Add dependency')" @click="add" /></template>

    <q-expansion-item class="editor-expansion-item" :label="label('跨加载器中间层', 'Cross-loader bridges')" icon="swap_horiz">
      <q-card-section>
        <p>{{ label('仅声明实际验证过的组合。中间层会自动成为必需依赖；原加载器的依赖仍会检查，不会被忽略。', 'Declare tested combinations only. The middleware becomes a required dependency; original loader dependencies remain checked.') }}</p>
        <div class="form-item-list">
          <FormItemCard v-for="(bridge, index) in version.loaderBridges" :key="index" :title="label('桥接组合', 'Bridge combination')" :description="bridge.viaProjectId || label('尚未选择中间层项目', 'No middleware project selected')">
            <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="label('删除桥接组合', 'Remove bridge')" @click="version.loaderBridges?.splice(index, 1)" /></template>
            <FormGrid>
              <q-select v-model="bridge.fromLoader" :options="version.loaders" outlined :label="label('原生加载器', 'Native loader')" />
              <q-input v-model="bridge.toLoader" outlined :label="label('目标加载器', 'Target loader')" />
              <q-input v-model="bridge.fromLoaderVersion" class="form-grid__full" outlined :label="label('中间层提供的原加载器 API 版本（可选）', 'Source loader API version provided by bridge (optional)')" />
              <q-input v-model="bridge.viaProjectId" outlined :label="label('中间层项目 ID', 'Middleware project ID')" />
              <q-input v-model="bridge.viaVersionId" outlined :label="label('中间层精确版本 ID', 'Middleware exact version ID')" />
              <q-input v-model="bridge.viaRange" outlined :label="label('中间层版本范围', 'Middleware version range')" />
              <q-select v-model="bridge.gameVersions" :options="version.gameVersions" multiple outlined :label="label('支持的游戏版本', 'Supported game versions')" />
              <q-select v-model="bridge.side" :options="['both', 'client', 'server']" outlined :label="label('运行环境', 'Side')" />
              <q-input v-model="bridge.reason" class="form-grid__full" outlined :label="label('兼容说明', 'Compatibility notes')" />
            </FormGrid>
          </FormItemCard>
        </div>
        <FormActions align="start">
          <q-btn outline color="primary" icon="add" :label="label('添加桥接组合', 'Add bridge')" @click="(version.loaderBridges ||= []).push({ fromLoader: version.loaders[0] || '', toLoader: '', viaProjectId: '', side: 'both' })" />
        </FormActions>
      </q-card-section>
    </q-expansion-item>

    <FormItemCard v-for="(dependency, index) in modelValue" :key="dependency.id || index" :title="dependency.external ? label('外部依赖', 'External dependency') : label('站内依赖', 'Local dependency')" :description="dependency.external ? `${dependency.external.provider} · ${dependency.external.projectId || label('未绑定项目', 'Unbound project')}` : dependency.projectId || label('尚未选择项目', 'No project selected')">
      <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="label('删除依赖', 'Remove dependency')" @click="emit('update:modelValue', modelValue.filter((_, itemIndex) => itemIndex !== index))" /></template>
      <FormGrid>
        <q-select class="form-grid__full" :model-value="dependency.external?.provider || 'local'" :options="[{ label: label('站内项目', 'Local project'), value: 'local' }, { label: 'Modrinth', value: 'modrinth' }, { label: 'CurseForge', value: 'curseforge' }]" emit-value map-options outlined :label="label('依赖来源', 'Dependency source')" @update:model-value="value => setSource(dependency, value)" />
        <template v-if="dependency.external">
          <q-input v-model="dependency.external.projectId" outlined :label="dependency.external.provider === 'modrinth' ? label('MR 项目 ID 或 slug（查询后绑定）', 'MR project ID or slug (lookup to bind)') : label('CF 项目数字 ID', 'CF numeric project ID')" @update:model-value="() => { if (dependency.external) dependency.external.versionId = undefined }" />
          <FormActions><q-btn outline color="primary" :label="label('查询并绑定', 'Look up and bind')" @click="bindExternal(dependency)" /></FormActions>
          <q-select v-model="dependency.external.versionId" class="form-grid__full" :options="externalReleases[`${dependency.external.provider}:${dependency.external.projectId}`] || []" option-label="version" option-value="id" emit-value map-options clearable outlined :label="label('外部精确版本 / 文件（可选）', 'External release / file (optional)')" @clear="dependency.external.versionId = undefined" />
          <a class="form-grid__full" :href="externalProjectUrl(dependency.external)" target="_blank" rel="noopener noreferrer">{{ label('打开原站项目', 'Open original project') }}</a>
        </template>
        <q-select v-else class="form-grid__full" :model-value="dependency.projectId" use-input input-debounce="250" :options="options" option-label="title" option-value="id" emit-value map-options outlined :label="label('搜索项目', 'Search projects')" @filter="search" @update:model-value="value => { dependency.projectId = value; dependency.versionId = undefined }" />
        <q-select v-model="dependency.dependencyType" :options="types" emit-value map-options outlined :label="label('关系', 'Relationship')" />
        <q-select v-if="!dependency.external" v-model="dependency.versionId" :options="(releases[dependency.projectId || ''] || []).map(version => ({ label: `${version.version} · ${version.loaders.join('/')} · ${version.gameVersions.join('/')}`, value: version.id }))" emit-value map-options clearable outlined :label="label('精确发布版本（可选）', 'Exact release (optional)')" @popup-show="loadReleases(dependency.projectId)" @clear="dependency.versionId = undefined" />
        <q-select :model-value="dependency.versionConstraint?.scheme || 'any'" :options="['any', 'semver', 'exact']" outlined :label="label('版本约束', 'Version constraint')" @update:model-value="value => dependency.versionConstraint = value === 'any' ? undefined : value === 'semver' ? { scheme: 'semver', range: '*' } : { scheme: 'exact', versions: [] }" />
        <q-input v-if="dependency.versionConstraint?.scheme === 'semver'" class="form-grid__full" v-model="dependency.versionConstraint.range" outlined label="SemVer" placeholder=">=1.0.0 &lt;2.0.0" />
        <q-input v-if="dependency.versionConstraint?.scheme === 'exact'" class="form-grid__full" :model-value="dependency.versionConstraint.versions.join(', ')" outlined :label="label('允许的版本号（逗号分隔）', 'Allowed versions (comma separated)')" @update:model-value="value => { if (dependency.versionConstraint?.scheme === 'exact') dependency.versionConstraint.versions = csv(value) }" />
        <q-select :model-value="dependency.appliesTo?.loaders || []" :options="[...version.loaders, ...(version.loaderBridges || []).map(bridge => bridge.toLoader)]" multiple outlined :label="label('适用加载器（空为全部）', 'Applicable loaders (empty: all)')" @update:model-value="value => dependency.appliesTo = { ...dependency.appliesTo, loaders: value }" />
        <q-select :model-value="dependency.appliesTo?.gameVersions || []" :options="version.gameVersions" multiple outlined :label="label('适用游戏版本', 'Applicable game versions')" @update:model-value="value => dependency.appliesTo = { ...dependency.appliesTo, gameVersions: value }" />
        <q-select :model-value="dependency.appliesTo?.side || 'both'" :options="['both', 'client', 'server']" outlined :label="label('运行环境', 'Environment')" @update:model-value="value => dependency.appliesTo = { ...dependency.appliesTo, side: value }" />
        <q-input :model-value="dependency.appliesTo?.loaderRange || ''" outlined :label="label('加载器版本范围', 'Loader version range')" @update:model-value="value => dependency.appliesTo = { ...dependency.appliesTo, loaderRange: String(value || '') || undefined }" />
        <q-input :model-value="dependency.when?.feature || ''" outlined :label="label('启用功能时生效', 'Enable when feature is selected')" @update:model-value="value => dependency.when = { ...dependency.when, feature: String(value || '') || undefined }" />
        <q-input class="form-grid__full" :model-value="dependency.when?.installedProjectIds?.join(', ') || ''" outlined :label="label('这些项目已安装时生效（项目 ID）', 'Activate when projects are installed (IDs)')" @update:model-value="value => dependency.when = { ...dependency.when, installedProjectIds: csv(value) }" />
        <q-input class="form-grid__full" v-model="dependency.reason" outlined :label="label('用途 / 联动功能说明', 'Purpose / integration description')" />
      </FormGrid>
    </FormItemCard>

    <AppNotice v-if="importError" tone="error" role="alert">{{ importError }}</AppNotice>
    <q-expansion-item class="editor-expansion-item" :label="label('导入 Mod 元数据', 'Import mod metadata')" icon="upload_file">
      <q-card-section>
        <FormGrid :columns="1">
          <q-input v-model="metadata" type="textarea" outlined autogrow :label="label('粘贴 fabric.mod.json 或 mods.toml', 'Paste fabric.mod.json or mods.toml')" />
          <FormActions align="start"><q-btn outline color="primary" :label="label('导入并映射 Mod ID', 'Import and map mod IDs')" @click="importMetadata" /></FormActions>
        </FormGrid>
        <div v-if="imported.length" class="form-item-list">
          <FormItemCard v-for="item in imported" :key="item.modId" :title="item.modId" :description="item.rawRange">
            <FormGrid :columns="2">
              <q-input class="form-grid__wide" v-model="item.projectId" outlined :label="label('站内项目 ID', 'Local project ID')" />
              <FormActions><q-btn outline color="primary" icon="add" :disable="!item.projectId" @click="appendImported(item)" /></FormActions>
            </FormGrid>
          </FormItemCard>
        </div>
      </q-card-section>
    </q-expansion-item>
  </FormSection>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import AppNotice from './AppNotice.vue'
import FormActions from './FormActions.vue'
import FormGrid from './FormGrid.vue'
import FormItemCard from './FormItemCard.vue'
import FormSection from './FormSection.vue'
import type { Dependency, Version, Project } from '@andrea/contracts'
import { externalProjectUrl, parseModDependencies, type ImportedDependency } from '@andrea/contracts'
import { listProjects, getProject } from '../lib/api'
import { lookupExternal } from '../lib/dependencies'
import { useI18n } from '../i18n'
const props = defineProps<{ modelValue: Dependency[]; version: Version }>()
const emit = defineEmits<{ 'update:modelValue': [Dependency[]] }>()
const { locale } = useI18n(); const label = (zh: string, en: string) => locale.value === 'zh-CN' ? zh : en
const types = computed(() => ['required','optional','recommended','integration','incompatible','embedded'].map((value,i) => ({ value, label: locale.value === 'zh-CN' ? ['必需','可选','推荐','联动','冲突','内嵌'][i] : value })))
const options = ref<Project[]>([])
const releases = ref<Record<string,Version[]>>({})
const loadReleases = async (id?: string) => { if (!id) return; try { const p = options.value.find(p => p.id === id); if (p) { releases.value[id] = (await getProject(p.slug)).versions; return }; const response = await listProjects({ query:id,limit:100 }); const match = response.projects.find(p => p.id === id); if(match) releases.value[id] = (await getProject(match.slug)).versions } catch (e) { importError.value = String(e) } }
const search = async (query: string, update: (fn: () => void) => void) => { try { const result = await listProjects({ query, limit: 30 }); update(() => options.value = result.projects) } catch { update(() => options.value = []) } }
const externalReleases = ref<Record<string, Array<{ id:string; version:string }>>>({})
const setSource = (d: Dependency, source: 'local' | 'modrinth' | 'curseforge') => {
  d.projectId = undefined; d.versionId = undefined; d.fileName = undefined
  d.external = source === 'local' ? undefined : { provider: source, projectId: '' }
}
const bindExternal = async (d: Dependency) => {
  if (!d.external) return
  const snapshot = JSON.stringify(d.external)
  try {
    const data = await lookupExternal(d.external, props.version.loaders[0] || '', props.version.gameVersions[0] || '')
    if (JSON.stringify(d.external) !== snapshot) return
    d.external = data.reference
    externalReleases.value[`${data.reference.provider}:${data.reference.projectId}`] = data.versions
    importError.value = ''
  } catch(e) { importError.value = String(e) }
}
const csv = (v: unknown) => String(v || '').split(',').map(s => s.trim()).filter(Boolean)
const add = () => emit('update:modelValue', [...props.modelValue, { id: crypto.randomUUID(), dependencyType: 'required' }])
const metadata = ref(''); const importError = ref(''); const imported = ref<Array<ImportedDependency & { projectId: string }>>([])
const importMetadata = () => { try { imported.value = parseModDependencies(metadata.value).map(d => ({ ...d, projectId: '' })); importError.value = '' } catch (e) { importError.value = String(e) } }
const appendImported = (item: ImportedDependency & { projectId: string }) => { emit('update:modelValue', [...props.modelValue, { ...item.dependency, id: crypto.randomUUID(), projectId: item.projectId }]); imported.value = imported.value.filter(d => d !== item) }
</script>
