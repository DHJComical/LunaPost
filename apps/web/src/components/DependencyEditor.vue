<template>
  <FormSection :title="t('dependencyEditor.dependenciesAndIntegrations')" :description="t('dependencyEditor.declareProjectDependenciesOptionalComponentsAndCrossLoaderBridges')">
    <template #actions><q-btn flat dense color="primary" icon="add" :label="t('dependencyEditor.addDependency')" @click="add" /></template>

    <q-expansion-item class="editor-expansion-item" :label="t('dependencyEditor.crossLoaderBridges')" icon="swap_horiz">
      <q-card-section>
        <p>{{ t('dependencyEditor.declareTestedCombinationsOnlyTheMiddlewareBecomesARequiredDependencyOriginalLoaderDependenciesRemainChecked') }}</p>
        <div class="form-item-list">
          <FormItemCard v-for="(bridge, index) in version.loaderBridges" :key="index" :title="t('dependencyEditor.bridgeCombination')" :description="bridge.viaProjectId || t('dependencyEditor.noMiddlewareProjectSelected')">
            <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="t('dependencyEditor.removeBridge')" @click="version.loaderBridges?.splice(index, 1)" /></template>
            <FormGrid>
              <StringOptionSelect v-model="bridge.fromLoader" :options="loaderOptions" :label="t('dependencyEditor.nativeLoader')" :hint="t('dependencyEditor.selectOrTypeALoader')" :empty-label="t('dependencyEditor.typeALoaderAndPressEnterToAdd')" />
              <StringOptionSelect v-model="bridge.toLoader" :options="loaderOptions" :label="t('dependencyEditor.targetLoader')" :hint="t('dependencyEditor.selectOrTypeALoader')" :empty-label="t('dependencyEditor.typeALoaderAndPressEnterToAdd')" />
              <q-input v-model="bridge.fromLoaderVersion" class="form-grid__full" outlined :label="t('dependencyEditor.sourceLoaderAPIVersionProvidedByBridgeOptional')" />
              <q-input v-model="bridge.viaProjectId" outlined :label="t('dependencyEditor.middlewareProjectID')" />
              <q-input v-model="bridge.viaVersionId" outlined :label="t('dependencyEditor.middlewareExactVersionID')" />
              <q-input v-model="bridge.viaRange" outlined :label="t('dependencyEditor.middlewareVersionRange')" />
              <StringOptionSelect v-model="bridge.gameVersions" :options="version.gameVersions" multiple :label="t('dependencyEditor.supportedGameVersions')" :hint="t('dependencyEditor.selectMultipleVersionsOrTypeANewOne')" :empty-label="t('dependencyEditor.typeAVersionAndPressEnterToAdd')" />
              <q-select v-model="bridge.side" :options="sideOptions" emit-value map-options outlined :label="t('dependencyEditor.side')" />
              <q-input v-model="bridge.reason" class="form-grid__full" outlined :label="t('dependencyEditor.compatibilityNotes')" />
            </FormGrid>
          </FormItemCard>
        </div>
        <FormActions align="start">
          <q-btn outline color="primary" icon="add" :label="t('dependencyEditor.addBridge')" @click="(version.loaderBridges ||= []).push({ fromLoader: version.loaders[0] || '', toLoader: '', viaProjectId: '', side: 'both' })" />
        </FormActions>
      </q-card-section>
    </q-expansion-item>

    <FormItemCard v-for="(dependency, index) in modelValue" :key="dependency.id || index" :title="dependency.external ? t('dependencyEditor.externalDependency') : t('dependencyEditor.localDependency')" :description="dependency.external ? `${dependency.external.provider} · ${dependency.external.projectId || t('dependencyEditor.unboundProject')}` : dependency.projectId || t('dependencyEditor.noProjectSelected')">
      <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="t('dependencyEditor.removeDependency')" @click="emit('update:modelValue', modelValue.filter((_, itemIndex) => itemIndex !== index))" /></template>
      <FormGrid>
        <q-select class="form-grid__full" :model-value="dependency.external?.provider || 'local'" :options="[{ label: t('dependencyEditor.localProject'), value: 'local' }, { label: 'Modrinth', value: 'modrinth' }, { label: 'CurseForge', value: 'curseforge' }]" emit-value map-options outlined :label="t('dependencyEditor.dependencySource')" @update:model-value="value => setSource(dependency, value)" />
        <template v-if="dependency.external">
          <q-input v-model="dependency.external.projectId" outlined :label="dependency.external.provider === 'modrinth' ? t('dependencyEditor.mrProjectIDOrSlugLookupToBind') : t('dependencyEditor.cfNumericProjectID')" @update:model-value="() => { if (dependency.external) dependency.external.versionId = undefined }" />
          <FormActions><q-btn outline color="primary" :label="t('dependencyEditor.lookUpAndBind')" @click="bindExternal(dependency)" /></FormActions>
          <q-select v-model="dependency.external.versionId" class="form-grid__full" :options="externalReleases[`${dependency.external.provider}:${dependency.external.projectId}`] || []" option-label="version" option-value="id" emit-value map-options clearable outlined :label="t('dependencyEditor.externalReleaseFileOptional')" @clear="dependency.external.versionId = undefined" />
          <a class="form-grid__full" :href="externalProjectUrl(dependency.external)" target="_blank" rel="noopener noreferrer">{{ t('dependencyEditor.openOriginalProject') }}</a>
        </template>
        <q-select v-else class="form-grid__full" :model-value="dependency.projectId" use-input input-debounce="250" :options="options" option-label="title" option-value="id" emit-value map-options outlined :label="t('dependencyEditor.searchProjects')" @filter="search" @update:model-value="value => { dependency.projectId = value; dependency.versionId = undefined }" />
        <q-select v-model="dependency.dependencyType" :options="types" emit-value map-options outlined :label="t('dependencyEditor.relationship')" />
        <q-select v-if="!dependency.external" v-model="dependency.versionId" :options="(releases[dependency.projectId || ''] || []).map(version => ({ label: `${version.version} · ${version.loaders.join('/')} · ${version.gameVersions.join('/')}`, value: version.id }))" emit-value map-options clearable outlined :label="t('dependencyEditor.exactReleaseOptional')" @popup-show="loadReleases(dependency.projectId)" @clear="dependency.versionId = undefined" />
        <q-select :model-value="dependency.versionConstraint?.scheme || 'any'" :options="['any', 'semver', 'exact']" outlined :label="t('dependencyEditor.versionConstraint')" @update:model-value="value => dependency.versionConstraint = value === 'any' ? undefined : value === 'semver' ? { scheme: 'semver', range: '*' } : { scheme: 'exact', versions: [] }" />
        <q-input v-if="dependency.versionConstraint?.scheme === 'semver'" class="form-grid__full" v-model="dependency.versionConstraint.range" outlined label="SemVer" placeholder=">=1.0.0 &lt;2.0.0" />
        <q-input v-if="dependency.versionConstraint?.scheme === 'exact'" class="form-grid__full" :model-value="dependency.versionConstraint.versions.join(', ')" outlined :label="t('dependencyEditor.allowedVersionsCommaSeparated')" @update:model-value="value => { if (dependency.versionConstraint?.scheme === 'exact') dependency.versionConstraint.versions = csv(value) }" />
        <StringOptionSelect :model-value="dependency.appliesTo?.loaders || []" :options="loaderOptions" multiple :label="t('dependencyEditor.applicableLoadersEmptyAll')" :hint="t('dependencyEditor.selectMultipleLoadersOrTypeANewOne')" :empty-label="t('dependencyEditor.typeALoaderAndPressEnterToAdd')" @update:model-value="values => dependency.appliesTo = { ...dependency.appliesTo, loaders: Array.isArray(values) ? values : [] }" />
        <StringOptionSelect :model-value="dependency.appliesTo?.gameVersions || []" :options="version.gameVersions" multiple :label="t('dependencyEditor.applicableGameVersions')" :hint="t('dependencyEditor.selectMultipleVersionsOrTypeANewOne')" :empty-label="t('dependencyEditor.typeAVersionAndPressEnterToAdd')" @update:model-value="values => dependency.appliesTo = { ...dependency.appliesTo, gameVersions: Array.isArray(values) ? values : [] }" />
        <q-select :model-value="dependency.appliesTo?.side || 'both'" :options="sideOptions" emit-value map-options outlined :label="t('dependencyEditor.environment')" @update:model-value="value => dependency.appliesTo = { ...dependency.appliesTo, side: value }" />
        <q-input :model-value="dependency.appliesTo?.loaderRange || ''" outlined :label="t('dependencyEditor.loaderVersionRange')" @update:model-value="value => dependency.appliesTo = { ...dependency.appliesTo, loaderRange: String(value || '') || undefined }" />
        <q-input :model-value="dependency.when?.feature || ''" outlined :label="t('dependencyEditor.enableWhenFeatureIsSelected')" @update:model-value="value => dependency.when = { ...dependency.when, feature: String(value || '') || undefined }" />
        <q-input class="form-grid__full" :model-value="dependency.when?.installedProjectIds?.join(', ') || ''" outlined :label="t('dependencyEditor.activateWhenProjectsAreInstalledIDs')" @update:model-value="value => dependency.when = { ...dependency.when, installedProjectIds: csv(value) }" />
        <q-input class="form-grid__full" v-model="dependency.reason" outlined :label="t('dependencyEditor.purposeIntegrationDescription')" />
      </FormGrid>
    </FormItemCard>

    <AppNotice v-if="importError" tone="error" role="alert">{{ importError }}</AppNotice>
    <q-expansion-item class="editor-expansion-item" :label="t('dependencyEditor.importModMetadata')" icon="upload_file">
      <q-card-section>
        <FormGrid :columns="1">
          <q-input v-model="metadata" type="textarea" outlined autogrow :label="t('dependencyEditor.pasteFabricModJsonOrModsToml')" />
          <FormActions align="start"><q-btn outline color="primary" :label="t('dependencyEditor.importAndMapModIDs')" @click="importMetadata" /></FormActions>
        </FormGrid>
        <div v-if="imported.length" class="form-item-list">
          <FormItemCard v-for="item in imported" :key="item.modId" :title="item.modId" :description="item.rawRange">
            <FormGrid :columns="2">
              <q-input class="form-grid__wide" v-model="item.projectId" outlined :label="t('dependencyEditor.localProjectID')" />
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
import StringOptionSelect from './StringOptionSelect.vue'
import type { Dependency, Version, Project } from '@andrea/contracts'
import { externalProjectUrl, parseModDependencies, type ImportedDependency } from '@andrea/contracts'
import { listProjects, getProject } from '../lib/api'
import { lookupExternal } from '../lib/dependencies'
import { useI18n } from '../i18n'
const props = defineProps<{ modelValue: Dependency[]; version: Version }>()
const emit = defineEmits<{ 'update:modelValue': [Dependency[]] }>()
const { t } = useI18n()
const types = computed(() => ['required', 'optional', 'recommended', 'integration', 'incompatible', 'embedded'].map(value => ({ value, label: t(`dependencyType.${value}`) })))
const sideOptions = computed(() => [{ value: 'both', label: t('dependencyType.both') }, { value: 'client', label: t('discover.client') }, { value: 'server', label: t('discover.server') }])
const options = ref<Project[]>([])
const loaderOptions = computed(() => [...new Set([...props.version.loaders, ...(props.version.loaderBridges || []).flatMap(bridge => [bridge.fromLoader, bridge.toLoader])])].filter(Boolean))
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
