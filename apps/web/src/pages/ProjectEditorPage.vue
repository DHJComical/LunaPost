<template>
  <q-page class="page-shell project-editor-page q-py-xl">
    <AppPageHeader :eyebrow="t('projectEditor.eyebrow')" :title="isNew ? t('projectEditor.newProject') : t('projectEditor.editProject')" :description="t('projectEditor.subtitle')">
      <template #actions><q-btn flat icon="arrow_back" :label="t('projectEditor.backAdmin')" to="/admin" /></template>
    </AppPageHeader>
    <AppNotice v-if="error" tone="error" class="q-mb-md">{{ error }}</AppNotice>
    <q-form @submit.prevent="save">
      <q-card flat bordered class="editor-shell">
        <q-tabs v-model="activeTab" inline-label mobile-arrows outside-arrows class="editor-tabs" active-color="primary" indicator-color="primary">
          <q-tab name="basic" icon="info" :label="t('projectEditor.tabBasic')" /><q-tab name="gallery" icon="photo_library" :label="t('projectEditor.tabGallery')" /><q-tab name="licenses" icon="gavel" :label="t('projectEditor.license')" /><q-tab name="content" icon="article" :label="t('projectEditor.tabContentLinks')" /><q-tab name="versions" icon="inventory_2" :label="t('projectEditor.tabVersionsFiles')" /><q-tab name="delivery" icon="public" :label="t('projectEditor.tabDelivery')" /><q-tab v-if="!isNew" name="members" icon="group" :label="t('projectEditor.tabMembers')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="activeTab" animated keep-alive class="editor-panels">
          <q-tab-panel name="basic">
            <FormSection :title="t('projectEditor.identity')" :description="t('projectEditor.identityDesc')">
              <FormGrid>
                <q-input v-model="form.title" outlined :label="t('projectEditor.projectName')" required />
                <q-input v-model="form.slug" outlined :label="t('common.slug')" :hint="t('projectEditor.slugHint')" required :disable="!isNew" />
                <q-select v-if="isNew && organizations.length" v-model="form.ownerId" outlined :label="t('projectEditor.owner')" emit-value map-options :options="ownerOptions" />
                <q-select v-model="form.type" outlined :label="t('projectEditor.projectType')" :options="types" emit-value map-options />
              </FormGrid>
            </FormSection>

            <FormSection :title="t('projectEditor.introIcon')" :description="t('projectEditor.introIconDesc')">
              <FormGrid>
                <q-input v-model="form.description" class="form-grid__full" outlined type="textarea" autogrow :label="t('projectEditor.projectDescription')" required />
                <q-input v-model="form.iconUrl" outlined :label="t('projectEditor.mainIconUrl')" />
                <FileButton :label="t('projectEditor.uploadIcon')" accept="image/*" @select="files => uploadAsset(files, 'icon')" />
                <q-input v-model="form.iconUrls" class="form-grid__full" outlined :label="t('projectEditor.moreIconUrls')" :hint="t('projectEditor.multipleUrlsHint')" />
              </FormGrid>
            </FormSection>

            <FormSection :title="t('projectEditor.compatibilitySources')" :description="t('projectEditor.compatibilitySourcesDesc')">
              <FormGrid>
                <q-input v-model="form.license" outlined :label="t('projectEditor.licenseIdentifier')" :placeholder="t('projectEditor.legacyLicensePlaceholder')" />
                <q-input v-model="form.repositoryUrl" outlined :label="t('projectEditor.repositoryUrl')" type="url" />
                <StringOptionSelect v-model="projectLoaders" :options="loaderOptions" multiple :label="t('projectEditor.loaders')" :hint="t('projectEditor.loaderSelectHint')" empty-:label="t('projectEditor.loaderAddHint')" />
                <StringOptionSelect v-model="projectGameVersions" :options="gameVersionOptions" multiple :label="t('projectEditor.gameVersions')" :hint="t('projectEditor.gameVersionSelectHint')" empty-:label="t('projectEditor.gameVersionAddHint')" />
              </FormGrid>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="gallery">
            <FormSection :title="t('projectEditor.gallery')" :description="t('projectEditor.galleryDesc')">
              <template #actions>
                <q-btn outline dense icon="add_link" :label="t('projectEditor.addUrl')" @click="galleryUrls.push('')" />
                <FileButton :label="t('projectEditor.uploadImage')" accept="image/*" multiple @select="uploadGalleryFiles" />
              </template>
              <div class="gallery-editor">
                <div v-if="galleryUrls.length" class="gallery-editor-grid">
                  <div v-for="(url, index) in galleryUrls" :key="`${url}-${index}`" class="gallery-editor-item">
                    <q-img v-if="url" :src="url" ratio="16/9" fit="cover" />
                    <div v-else class="gallery-editor-placeholder"><q-icon name="image" size="32px" /></div>
                    <q-btn round dense color="negative" icon="delete" class="gallery-editor-remove" aria-:label="t('projectEditor.deleteImage')" @click="galleryUrls.splice(index, 1)" />
                    <q-input v-model="galleryUrls[index]" outlined :placeholder="t('projectEditor.imageUrl')" />
                  </div>
                </div>
                <q-input v-else v-model="form.gallery" outlined :label="t('projectEditor.optionalImageUrl')" :hint="t('projectEditor.galleryUrlHint')" />
              </div>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="licenses">
            <FormSection :title="t('projectEditor.licenseFiles')" :description="t('projectEditor.licensesDesc')">
              <template #actions>
                <q-btn outline dense icon="add" :label="t('projectEditor.addLicense')" @click="licenses.push({ id: `license-${Date.now()}`, name: t('projectEditor.newLicense'), fileName: 'LICENSE', text: '' })" />
              </template>
              <div class="form-item-list">
                <FormItemCard v-for="(license, index) in licenses" :key="license.id" :title="license.name || t('projectEditor.licenseNumber', { number: index + 1 })">
                  <template #actions>
                    <q-btn flat dense round color="negative" icon="delete" :aria-label="t('projectEditor.deleteLicense', { name: license.name || index + 1 })" @click="licenses.splice(index, 1)" />
                  </template>
                  <FormGrid>
                    <q-input v-model="license.name" outlined :label="t('projectEditor.name')" />
                    <q-input v-model="license.spdx" outlined :label="t('projectEditor.spdx')" placeholder="MIT / LGPL-3.0" />
                    <q-input v-model="license.fileName" outlined :label="t('projectEditor.filename')" placeholder="LICENSE" />
                    <q-input v-model="license.url" outlined :label="t('projectEditor.licenseUrl')" type="url" />
                    <CodeEditor :model-value="license.text ?? ''" class="form-grid__full" language="plaintext" :label="`${license.name || t('projectEditor.license')} ${t('projectEditor.originalText')}`" height="220px" @update:model-value="value => license.text = value" />
                  </FormGrid>
                </FormItemCard>
              </div>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="content">
            <FormSection :title="t('projectEditor.contentCategories')" :description="t('projectEditor.contentCategoriesDesc')">
              <FormGrid>
                <q-input v-model="form.categories" outlined :label="t('projectEditor.categories')" :hint="t('projectEditor.categoriesExample')" />
                <q-input v-model="form.keywords" outlined :label="t('projectEditor.keywords')" :hint="t('projectEditor.keywordsHint')" />
                <q-select v-model="form.clientSide" outlined emit-value map-options :label="t('discover.client')" :options="environmentTypes" />
                <q-select v-model="form.serverSide" outlined emit-value map-options :label="t('discover.server')" :options="environmentTypes" />
                <q-select v-model="form.status" outlined emit-value map-options :label="t('projectEditor.reviewStatus')" :options="statusOptions" />
                <q-toggle v-model="form.featured" dense :label="t('projectEditor.featuredProject')" color="primary" />
                <CodeEditor v-model="form.body" class="form-grid__full" language="markdown" :label="t('projectEditor.projectBody')" height="420px" />
              </FormGrid>
            </FormSection>
            <FormSection :title="t('projectEditor.linksCommunity')" :description="t('projectEditor.linksCommunityDesc')">
              <FormGrid>
                <q-input v-model="form.sourceUrl" outlined :label="t('projectEditor.sourceUrl')" type="url" />
                <q-input v-model="form.issuesUrl" outlined :label="t('projectEditor.issuesUrl')" type="url" />
                <q-input v-model="form.discordUrl" outlined :label="t('projectEditor.discordUrl')" type="url" />
                <q-input v-model="form.wikiUrl" outlined :label="t('projectEditor.externalWikiUrl')" type="url" />
                <q-input v-model="form.donationUrls" class="form-grid__full" outlined :label="t('projectEditor.donationLinks')" :hint="t('projectEditor.donationHint')" />
                <div class="form-grid__full">
                  <FormSection :title="t('projectEditor.customLinks')" :description="t('projectEditor.customLinksDesc')">
                    <template #actions>
                      <q-btn flat dense color="primary" icon="add_link" :label="t('projectEditor.addLink')" @click="addCustomLink" />
                    </template>
                    <div v-if="!customLinks.length" class="text-caption text-grey-7">{{ t('projectEditor.noCustomLinks') }}</div>
                    <div v-else class="form-item-list">
                      <FormItemCard v-for="(link, linkIndex) in customLinks" :key="link.id || linkIndex" :title="link.label || t('projectEditor.linkNumber', { number: linkIndex + 1 })" :description="link.url || undefined">
                        <template #actions><q-btn flat dense round icon="delete" color="negative" :aria-label="t('projectEditor.deleteLink', { name: link.label || linkIndex + 1 })" @click="customLinks.splice(linkIndex, 1)" /></template>
                        <FormGrid :columns="2">
                          <q-input v-model="link.label" outlined :label="t('projectEditor.displayName')" />
                          <q-input v-model="link.url" outlined label="URL" type="url" />
                          <q-input v-model="link.icon" outlined :label="t('projectEditor.iconName')" :hint="t('common.materialIcon')" />
                          <q-input v-model="link.group" outlined :label="t('projectEditor.group')" />
                          <q-toggle v-model="link.embed" class="form-grid__full" dense :label="t('projectEditor.embedInProject')" color="primary" />
                        </FormGrid>
                      </FormItemCard>
                    </div>
                  </FormSection>
                </div>
              </FormGrid>
            </FormSection>
            <FormSection :title="t('projectEditor.homepageWiki')" :description="t('projectEditor.advancedHtml')">
              <CodeEditor v-model="form.homepageHtml" language="html" :label="t('projectEditor.homepageHtml')" height="320px" />
              <CodeEditor v-model="form.wikiHtml" language="html" :label="t('projectEditor.wikiHtmlOptional')" height="320px" />
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="versions">
            <FormSection :title="t('projectEditor.tabVersionsFiles')" :description="t('projectEditor.versionFilesDesc')">
              <template #actions>
                <q-btn-toggle v-model="versionMode" dense unelevated toggle-color="primary" :options="[{ label: t('projectEditor.visualMode'), value: 'visual' }, { label: t('projectEditor.sourceMode'), value: 'source' }]" />
              </template>
            <div v-if="versionMode === 'visual'">
              <div class="form-item-list">
                <q-expansion-item v-for="(version, versionIndex) in visualVersions" :key="version.id" class="editor-expansion-item version-editor-item" expand-separator default-opened>
                <template #header><q-item-section><q-item-label>{{ version.version || t('projectEditor.unnamedVersion') }}</q-item-label><q-item-label caption>{{ versionTypeLabel(version.type) }} · {{ t('common.filesCount', { count: version.files.length }) }}</q-item-label></q-item-section><q-item-section side><q-btn flat round dense icon="delete" color="negative" @click.stop="visualVersions.splice(versionIndex, 1)" /></q-item-section></template>
                <q-card-section>
                  <FormGrid>
                    <q-input v-model="version.version" outlined :label="t('projectEditor.versionNumber')" />
                    <q-select v-model="version.type" outlined :label="t('projectEditor.releaseType')" emit-value map-options :options="versionTypes" />
                    <StringOptionSelect v-model="version.gameVersions" :options="gameVersionOptions" multiple :label="t('projectEditor.gameVersions')" :hint="t('projectEditor.gameVersionMultiHint')" empty-:label="t('projectEditor.gameVersionAddHint')" />
                    <StringOptionSelect v-model="version.loaders" :options="loaderOptions" multiple :label="t('projectEditor.loaders')" :hint="t('projectEditor.loaderMultiHint')" empty-:label="t('projectEditor.loaderAddHint')" />
                    <q-input v-model="version.publishedAt" outlined :label="t('projectEditor.publishedAt')" :hint="t('projectEditor.isoDateOptional')" />
                    <CodeEditor :model-value="version.description ?? ''" class="form-grid__full" language="markdown" :label="t('projectEditor.versionDescription')" height="240px" @update:model-value="value => version.description = value" />
                    <CodeEditor :model-value="version.changelog ?? ''" class="form-grid__full" language="markdown" :label="t('projectEditor.changelog')" height="300px" @update:model-value="value => version.changelog = value" />
                  </FormGrid>
                  <DependencyEditor v-model="version.dependencies" :version="version" />
                  <SectionHeading :title="t('projectEditor.filesMirrors')">
                    <template #actions><q-btn flat dense color="primary" icon="add" :label="t('projectEditor.addFile')" @click="addFile(version)" /></template>
                  </SectionHeading>
                  <div class="form-item-list">
                    <FormItemCard v-for="(file, fileIndex) in version.files" :key="file.id" :title="file.name || t('projectEditor.unnamedFile')">
                    <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="t('projectEditor.deleteFile', { name: file.name || fileIndex + 1 })" @click="version.files.splice(fileIndex, 1)" /></template>
                    <FormGrid>
                      <q-input v-model="file.id" outlined :label="t('projectEditor.fileId')" />
                      <q-input v-model="file.name" outlined :label="t('projectEditor.filename')" />
                      <q-select v-model="file.fileType" outlined emit-value map-options :label="t('projectEditor.fileType')" :options="fileTypes" />
                      <q-toggle v-model="file.primary" dense :label="t('projectEditor.primaryFile')" color="primary" />
                      <q-input v-model.number="file.size" outlined type="number" :label="t('projectEditor.sizeBytes')" />
                      <q-input v-model="file.sha1" outlined label="SHA-1" />
                      <q-input v-model="file.sha512" outlined label="SHA-512" />
                      <q-input v-model="file.description" class="form-grid__full" outlined type="textarea" autogrow :label="t('projectEditor.fileDescription')" />
                      <CodeEditor :model-value="metadataText(file)" class="form-grid__full" language="json" :label="t('projectEditor.metadataJson')" height="280px" @update:model-value="(value) => updateMetadata(file, value)" />
                    </FormGrid>
                    <SectionHeading :title="t('projectEditor.mirrorAddress')" :description="t('projectEditor.mirrorManualHint')">
                      <template #actions>
                        <FileButton :label="t('projectEditor.uploadHere')" @select="files => uploadSelected(files, file)" />
                        <q-btn flat dense color="primary" icon="add" :label="t('projectEditor.addMirror')" @click="addSource(file)" />
                      </template>
                    </SectionHeading>
                    <div class="form-item-list">
                      <FormItemCard v-for="(source, sourceIndex) in file.sources" :key="source.id" :title="t('projectEditor.downloadMirror')" :description="source.id">
                      <template #actions><q-btn flat round dense icon="delete" color="negative" :disable="file.sources.length <= 1" :aria-label="t('projectEditor.deleteMirror', { id: source.id })" @click="file.sources.splice(sourceIndex, 1)" /></template>
                      <FormGrid :columns="3">
                          <q-input v-model="source.id" outlined :label="t('projectEditor.mirrorId')" />
                          <q-select v-model="source.kind" outlined emit-value map-options :label="t('projectEditor.type')" :options="sourceTypes" />
                          <q-input v-model="source.region" outlined :label="t('projectEditor.region')" hint="GLOBAL/CN/EU" />
                          <q-input v-model.number="source.priority" outlined type="number" :label="t('projectEditor.priority')" />
                          <q-input v-model="source.url" class="form-grid__full" outlined :label="t('projectEditor.downloadUrl')" type="url" />
                      </FormGrid>
                      </FormItemCard>
                    </div>
                    </FormItemCard>
                  </div>
                </q-card-section>
                </q-expansion-item>
              </div>
              <DependencyPanel v-if="previewProject" :project="previewProject" preview />
              <q-btn outline color="primary" icon="add" :label="t('projectEditor.addVersion')" class="q-mt-md" @click="addVersion" />
            </div>
            <div v-else><q-btn flat color="primary" :label="t('projectEditor.fillVersionTemplate')" @click="useTemplate" /><CodeEditor v-model="versionsJson" class="q-mt-sm" language="json" :label="t('projectEditor.versionsJson')" height="480px" :error="Boolean(jsonError)" :error-message="jsonError" /></div>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="delivery">
            <FormSection :title="t('projectEditor.cdnRules')" :description="t('projectEditor.cdnRulesDesc')">
              <AppNotice tone="info">{{ t('projectEditor.deliveryHintStart') }} <code>{{ t('projectEditor.sourceParamExample') }}</code> {{ t('projectEditor.deliveryHintEnd') }}</AppNotice>
              <div class="form-item-list">
                <FormItemCard v-for="(rule, index) in cdnRules" :key="rule.id" :title="rule.label || t('projectEditor.cdnRuleNumber', { number: index + 1 })" :description="rule.id">
                  <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="t('projectEditor.deleteCdnRule', { id: rule.id })" @click="cdnRules.splice(index, 1)" /></template>
                  <FormGrid>
                    <q-input v-model="rule.id" outlined :label="t('projectEditor.ruleId')" />
                    <q-input v-model="rule.label" outlined :label="t('projectEditor.name')" />
                    <q-input v-model="rule.region" outlined :label="t('projectEditor.region')" />
                    <q-input v-model.number="rule.priority" outlined type="number" :label="t('projectEditor.priority')" />
                    <q-input v-model="rule.template" class="form-grid__full" outlined :label="t('projectEditor.urlTemplate')" />
                    <q-toggle v-model="rule.enabled" dense :label="t('projectEditor.enabled')" color="primary" />
                  </FormGrid>
                </FormItemCard>
              </div>
              <q-btn outline color="primary" icon="add" :label="t('projectEditor.addCdnRule')" @click="addCdnRule" />
            </FormSection>
          </q-tab-panel>

          <q-tab-panel v-if="!isNew" name="members">
            <FormSection :title="t('projectEditor.members')" :description="t('projectEditor.membersDesc')">
              <FormItemCard :title="t('projectEditor.inviteMember')" :description="t('projectEditor.searchAccountsHint')">
                <q-form @submit.prevent="invite">
                  <FormGrid :columns="3">
                    <q-select v-model="inviteEmail" class="form-grid__wide member-search-select" outlined stack-label use-input fill-input hide-selected emit-value map-options input-debounce="250" :label="t('projectEditor.searchMember')" :placeholder="t('projectEditor.emailIdSearchHint')" :options="userOptions" option-label="email" option-value="email" :disable="inviting" :loading="usersLoading" autocomplete="off" @focus="loadUserOptions()" @filter="filterUsers">
                      <template #option="scope">
                        <q-item v-bind="scope.itemProps"><q-item-section><q-item-label>{{ scope.opt.email }}</q-item-label><q-item-label caption>@{{ scope.opt.id }} · {{ roleLabel(scope.opt.role) }}</q-item-label></q-item-section></q-item>
                      </template>
                      <template #no-option><q-item><q-item-section class="text-grey-7">{{ t('projectEditor.noMatchingUsers') }}</q-item-section></q-item></template>
                    </q-select>
                    <q-select v-model="inviteRole" outlined emit-value map-options :label="t('projectEditor.projectPermission')" :options="memberRoleOptions" :disable="inviting" />
                    <FormActions class="form-grid__full"><q-btn color="primary" unelevated icon="person_add" :label="t('projectEditor.sendInvite')" type="submit" :loading="inviting" /></FormActions>
                  </FormGrid>
                  <AppNotice v-if="inviteMessage" tone="success" class="q-mt-md">{{ inviteMessage }}</AppNotice>
                </q-form>
              </FormItemCard>
              <FormItemCard :title="t('projectEditor.currentMembers')">
                <q-list separator>
                  <q-item v-for="member in members" :key="member.accountId">
                    <q-item-section avatar><q-avatar color="primary" text-color="dark">{{ member.email.slice(0, 1).toUpperCase() }}</q-avatar></q-item-section>
                    <q-item-section><q-item-label>{{ member.email }}</q-item-label><q-item-label caption>{{ roleLabels[member.role] ?? member.role }}</q-item-label></q-item-section>
                    <q-item-section side><q-btn v-if="member.role !== 'owner'" flat dense color="negative" :label="t('projectEditor.remove')" @click="removeMember(member.accountId)" /></q-item-section>
                  </q-item>
                  <q-item v-if="!members.length"><q-item-section class="text-grey-7">{{ t('projectEditor.noMembers') }}</q-item-section></q-item>
                </q-list>
              </FormItemCard>
            </FormSection>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
      <div class="editor-action-bar">
        <div class="editor-action-bar__inner">
          <FormActions class="editor-action-bar__actions"><q-btn flat :label="t('projectEditor.cancel')" to="/admin" /><q-btn color="primary" type="submit" :loading="saving" :label="isNew ? t('projectEditor.createProject') : t('projectEditor.saveChanges')" /></FormActions>
        </div>
      </div>
    </q-form>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CdnRule, FileRecord, LicenseRecord, ProjectLink, Version } from '@andrea/contracts'
import { getProject } from '../lib/api'
import { createProject, updateProject, inviteProjectMember, listProjectMembers, removeProjectMember, type ProjectMember } from '../lib/admin'
import { listOrganizations, searchUsers, type UserSearchResult } from '../lib/account'
import { useAuthStore } from '../stores/auth'
import CodeEditor from '../components/CodeEditor.vue'
import DependencyEditor from '../components/DependencyEditor.vue'
import DependencyPanel from '../components/DependencyPanel.vue'
import FileButton from '../components/FileButton.vue'
import StringOptionSelect from '../components/StringOptionSelect.vue'
import AppNotice from '../components/AppNotice.vue'
import AppPageHeader from '../components/AppPageHeader.vue'
import FormActions from '../components/FormActions.vue'
import FormGrid from '../components/FormGrid.vue'
import FormItemCard from '../components/FormItemCard.vue'
import FormSection from '../components/FormSection.vue'
import SectionHeading from '../components/SectionHeading.vue'
import { projectSchema } from '@andrea/contracts'
import { useI18n } from '../i18n'

const { t, locale, roleLabel, versionTypeLabel } = useI18n(); const route = useRoute(); const router = useRouter(); const auth = useAuthStore(); const saving = ref(false); const error = ref(''); const jsonError = ref('')
const isNew = computed(() => route.path === '/admin/projects/new' || route.params.slug === 'new'); const activeTab = ref<'basic' | 'gallery' | 'licenses' | 'content' | 'versions' | 'delivery' | 'members'>('basic'); const versionMode = ref<'visual' | 'source'>('visual'); const visualVersions = ref<Version[]>([]); const versionsJson = ref('[]')
const versionTypes = computed(() => [{ label: t('project.versionType.release'), value: 'release' }, { label: t('project.versionType.beta'), value: 'beta' }, { label: t('project.versionType.alpha'), value: 'alpha' }]); const fileTypes = computed(() => [{ label: t('projectEditor.fileMod'), value: 'mod' }, { label: t('projectEditor.resourcePack'), value: 'required-resource-pack' }, { label: t('projectEditor.optionalResourcePack'), value: 'optional-resource-pack' }, { label: t('projectEditor.sourceArchive'), value: 'source-jar' }, { label: t('projectEditor.otherFile'), value: 'unknown' }]); const sourceTypes = computed(() => [{ label: t('projectEditor.githubRelease'), value: 'github_release' }, { label: t('projectEditor.customHttp'), value: 'custom_http' }, { label: t('project.sourceManaged'), value: 'managed' }])
const types = computed(() => [{ label: t('projectEditor.fileMod'), value: 'mod' }, { label: t('projectEditor.modpack'), value: 'modpack' }, { label: t('projectEditor.resourcePack'), value: 'resourcepack' }, { label: t('projectEditor.shader'), value: 'shader' }, { label: t('discover.plugins'), value: 'plugin' }, { label: t('discover.tools'), value: 'tool' }]); const environmentTypes = computed(() => [{ label: t('common.required'), value: 'required' }, { label: t('common.optional'), value: 'optional' }, { label: t('common.unsupported'), value: 'unsupported' }, { label: t('common.unknown'), value: 'unknown' }]); const statusOptions = computed(() => [{ label: t('status.approved'), value: 'approved' }, { label: t('status.pending'), value: 'pending' }, { label: t('status.draft'), value: 'draft' }, { label: t('status.archived'), value: 'archived' }])
const form = reactive({ id: '', title: '', slug: '', type: 'mod', ownerId: '', description: '', body: '', categories: '', keywords: '', clientSide: 'unknown', serverSide: 'unknown', status: 'approved', featured: false, iconUrl: '', iconUrls: '', repositoryUrl: '', sourceUrl: '', issuesUrl: '', discordUrl: '', donationUrls: '', license: '', wikiUrl: '', wikiHtml: '', gallery: '', homepageHtml: '', loaders: '', gameVersions: '' }); const licenses = ref<LicenseRecord[]>([]); const galleryUrls = ref<string[]>([]); const members = ref<ProjectMember[]>([]); const roleLabels = computed<Record<string, string>>(() => ({ owner: t('project.role.owner'), admin: t('project.role.admin'), editor: t('project.role.editor'), reviewer: t('project.role.reviewer'), member: t('project.role.member') })); const inviteEmail = ref(''); const inviteRole = ref<'admin' | 'editor' | 'reviewer' | 'member'>('editor'); const inviteMessage = ref(''); const inviting = ref(false); const usersLoading = ref(false); const memberRoleOptions = computed(() => [{ label: t('project.role.admin'), value: 'admin' }, { label: t('project.role.editor'), value: 'editor' }, { label: t('project.role.reviewer'), value: 'reviewer' }, { label: t('project.role.member'), value: 'member' }]); const userOptions = ref<UserSearchResult[]>([]); const customLinks = ref<ProjectLink[]>([]); const cdnRules = ref<CdnRule[]>([]); const organizations = ref<Awaited<ReturnType<typeof listOrganizations>>['organizations']>([]); const ownerOptions = computed(() => [{ label: t('projectEditor.myAccount'), value: '' }, ...organizations.value.map((organization) => ({ label: t('projectEditor.organizationOption', { name: organization.name }), value: organization.id }))])
const projectGameVersions = computed<string[]>({
  get: () => form.gameVersions.split(',').map((value) => value.trim()).filter(Boolean),
  set: (values) => { form.gameVersions = values.join(', ') },
})
const projectLoaders = computed<string[]>({
  get: () => form.loaders.split(',').map((value) => value.trim()).filter(Boolean),
  set: (values) => { form.loaders = values.join(', ') },
})
const gameVersionOptions = computed(() => [...new Set([...projectGameVersions.value, ...visualVersions.value.flatMap((version) => version.gameVersions)])].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))
const loaderOptions = computed(() => [...new Set([...projectLoaders.value, ...visualVersions.value.flatMap((version) => [...version.loaders, ...(version.loaderBridges ?? []).flatMap((bridge) => [bridge.fromLoader, bridge.toLoader])])])].filter(Boolean).sort((a, b) => a.localeCompare(b)))
const previewProject = computed(() => { const result = projectSchema.safeParse({ ...form, id: form.id || form.slug, loaders: form.loaders.split(',').map(s => s.trim()), gameVersions: form.gameVersions.split(',').map(s => s.trim()), categories: [], keywords: [], iconUrls: [], gallery: [], versions: visualVersions.value, repositoryUrl: undefined, iconUrl: undefined, sourceUrl: undefined, issuesUrl: undefined, discordUrl: undefined, wikiUrl: undefined, donationUrls: [] }); return result.success ? result.data : null })
const csv = (value: unknown) => String(value).split(',').map((item) => item.trim()).filter(Boolean); const metadataDrafts = ref<Record<string, string>>({}); const metadataText = (file: FileRecord) => metadataDrafts.value[file.id] ?? JSON.stringify(file.metadata ?? {}, null, 2); const updateMetadata = (file: FileRecord, value: string) => { metadataDrafts.value[file.id] = value; try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) file.metadata = parsed } catch { /* preserve the draft until it becomes valid JSON */ } }
watch(versionMode, (mode, previous) => { if (mode === 'source' && previous === 'visual') versionsJson.value = JSON.stringify(visualVersions.value, null, 2); if (mode === 'visual' && previous === 'source') { try { const parsed = JSON.parse(versionsJson.value); if (Array.isArray(parsed)) { visualVersions.value = parsed; jsonError.value = '' } } catch { jsonError.value = t('projectEditor.invalidSourceJson') } } })
const useTemplate = () => { versionsJson.value = JSON.stringify([{ id: `${form.slug || 'project'}-1.0.0`, version: '1.0.0', type: 'release', gameVersions: csv(form.gameVersions), loaders: csv(form.loaders), featured: true, status: 'listed', dependencies: [], changelog: '', publishedAt: new Date().toISOString(), files: [] }], null, 2) }
const addVersion = () => { visualVersions.value.push({ id: `${form.slug || 'project'}-${Date.now()}`, version: '1.0.0', type: 'release', gameVersions: csv(form.gameVersions), loaders: csv(form.loaders), featured: true, status: 'listed', dependencies: [], changelog: '', publishedAt: new Date().toISOString(), files: [] }) }
const addFile = (version: Version) => { version.files.push({ id: `${version.id}-file-${Date.now()}`, name: 'project.jar', primary: version.files.length === 0, fileType: 'unknown', metadata: {}, reviewStatus: 'approved', sources: [{ id: `source-${Date.now()}`, kind: 'custom_http', region: 'GLOBAL', url: 'https://example.invalid/download', priority: 10 }] }) }
const addSource = (file: FileRecord) => { file.sources.push({ id: `source-${Date.now()}`, kind: 'custom_http', region: 'GLOBAL', url: 'https://example.invalid/download', priority: 0 }) }; const addCdnRule = () => { cdnRules.value.push({ id: `cdn-${Date.now()}`, label: t('projectEditor.newCdn'), template: 'https://cdn.example.com/{projectSlug}/{version}/{filename}', region: 'GLOBAL', priority: 0, enabled: true }) }; const addCustomLink = () => { customLinks.value.push({ id: `link-${Date.now()}`, label: '', url: '', icon: 'link', group: '' }) }
const uploadSelected = async (value: File | File[] | null, file: FileRecord) => { const selected = Array.isArray(value) ? value[0] : value; if (!selected) return; const body = new FormData(); body.append('file', selected); try { const response = await fetch(`/api/v1/projects/${encodeURIComponent(String(route.params.slug))}/files`, { method: 'POST', body, credentials: 'include', headers: { 'Accept-Language': locale.value } }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? t('projectEditor.uploadFailed')); file.name = result.name; file.size = result.size; file.sources = [result.source, ...file.sources.filter((source) => source.id !== result.source.id)] } catch (cause) { error.value = cause instanceof Error ? cause.message : t('projectEditor.fileUploadFailed') } }
const uploadAsset = async (value: File | File[] | null, target: 'icon' | 'gallery') => { const selected = Array.isArray(value) ? value[0] : value; if (!selected) return; const body = new FormData(); body.append('file', selected); try { const response = await fetch('/api/v1/account/uploads', { method: 'POST', body, credentials: 'include', headers: { 'Accept-Language': locale.value } }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? t('projectEditor.uploadFailed')); if (target === 'icon') form.iconUrl = result.url; else form.gallery = `${form.gallery}${form.gallery ? ', ' : ''}${result.url}` } catch (cause) { error.value = cause instanceof Error ? cause.message : t('projectEditor.imageUploadFailed') } }
const uploadGalleryFiles = async (value: File | File[] | null) => { const files = Array.isArray(value) ? value : value ? [value] : []; for (const selected of files) { const body = new FormData(); body.append('file', selected); try { const response = await fetch('/api/v1/account/uploads', { method: 'POST', body, credentials: 'include', headers: { 'Accept-Language': locale.value } }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? t('projectEditor.uploadFailed')); galleryUrls.value.push(result.url) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('projectEditor.imageUploadFailed') } } }
const load = async () => { await auth.load(); if (!auth.account) return router.replace('/auth'); if (!auth.canPublish) return router.replace('/'); organizations.value = (await listOrganizations()).organizations; if (isNew.value) { form.ownerId = ''; return } try { const project = await getProject(String(route.params.slug)); Object.assign(form, { id: project.id, title: project.title, slug: project.slug, type: project.type, ownerId: project.ownerType === 'organization' ? (project.ownerId ?? '') : '', description: project.description, body: project.body ?? '', categories: (project.categories ?? []).join(', '), keywords: (project.keywords ?? []).join(', '), clientSide: project.clientSide ?? 'unknown', serverSide: project.serverSide ?? 'unknown', status: project.status ?? 'approved', featured: project.featured ?? false, iconUrl: project.iconUrl ?? '', iconUrls: (project.iconUrls ?? []).join(', '), repositoryUrl: project.repositoryUrl ?? '', sourceUrl: project.sourceUrl ?? '', issuesUrl: project.issuesUrl ?? '', discordUrl: project.discordUrl ?? '', donationUrls: (project.donationUrls ?? []).map((item) => `${item.platform}=${item.url}`).join(', '), license: project.license ?? '', wikiUrl: project.wikiUrl ?? '', wikiHtml: project.wikiHtml ?? '', gallery: '', homepageHtml: project.homepageHtml ?? '', loaders: project.loaders.join(', '), gameVersions: project.gameVersions.join(', ') }); galleryUrls.value = [...(project.gallery ?? [])]; licenses.value = structuredClone(project.licenses ?? (project.license ? [{ id: 'legacy-license', name: project.license, spdx: project.license, fileName: 'LICENSE', text: '' }] : [])); customLinks.value = structuredClone(project.links ?? []); cdnRules.value = structuredClone(project.cdnRules ?? []); visualVersions.value = structuredClone(project.versions).map((version) => ({ ...version, files: version.files.map((file) => ({ ...file, fileType: file.fileType ?? 'unknown', metadata: file.metadata ?? {}, sources: file.sources.length ? file.sources : [{ id: `source-${file.id}`, kind: 'custom_http' as const, region: 'GLOBAL', url: 'https://example.invalid/download', priority: 0 }] })) })); versionsJson.value = JSON.stringify(project.versions, null, 2); members.value = (await listProjectMembers(String(route.params.slug))).members } catch { error.value = t('projectEditor.readFailed') } }
const save = async () => { error.value = ''; jsonError.value = ''; if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) { error.value = t('projectEditor.invalidSlug'); activeTab.value = 'basic'; return } let versions: unknown = versionMode.value === 'visual' ? visualVersions.value : undefined; if (versionMode.value === 'source') { try { versions = JSON.parse(versionsJson.value); if (!Array.isArray(versions)) throw new Error() } catch { jsonError.value = t('projectEditor.invalidJsonArray'); activeTab.value = 'versions'; return } } const donationUrls = csv(form.donationUrls).map((item) => { const [platform, ...urlParts] = item.split('='); return { platform: platform.trim(), url: urlParts.join('=').trim() } }).filter((item) => item.platform && item.url); const links = customLinks.value.map((link) => ({ ...link, label: link.label.trim(), url: link.url.trim(), icon: link.icon?.trim() || 'link', group: link.group?.trim() || undefined })).filter((link) => link.label && link.url); const project = { id: form.id || form.slug, slug: form.slug, ownerType: form.ownerId ? 'organization' : 'account', ...(form.ownerId ? { ownerId: form.ownerId } : {}), title: form.title.trim(), type: form.type, description: form.description.trim(), body: form.body.trim(), categories: csv(form.categories), keywords: csv(form.keywords), clientSide: form.clientSide, serverSide: form.serverSide, status: form.status, featured: form.featured, ...(form.iconUrl.trim() ? { iconUrl: form.iconUrl.trim() } : {}), iconUrls: csv(form.iconUrls), ...(form.repositoryUrl.trim() ? { repositoryUrl: form.repositoryUrl.trim() } : {}), ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}), ...(form.issuesUrl.trim() ? { issuesUrl: form.issuesUrl.trim() } : {}), ...(form.discordUrl.trim() ? { discordUrl: form.discordUrl.trim() } : {}), donationUrls, links, cdnRules: cdnRules.value, ...(form.license.trim() ? { license: form.license.trim() } : {}), licenses: licenses.value.filter((license) => license.name.trim() || license.url || license.text).map((license) => ({ ...license, name: license.name.trim() || t('projectEditor.license'), spdx: license.spdx?.trim() || undefined, url: license.url?.trim() || undefined, fileName: license.fileName?.trim() || undefined, text: license.text || undefined })), ...(form.wikiUrl.trim() ? { wikiUrl: form.wikiUrl.trim() } : {}), ...(form.wikiHtml.trim() ? { wikiHtml: form.wikiHtml } : {}), gallery: galleryUrls.value.length ? galleryUrls.value.filter(Boolean) : csv(form.gallery), ...(form.homepageHtml.trim() ? { homepageHtml: form.homepageHtml } : {}), loaders: csv(form.loaders), gameVersions: csv(form.gameVersions), versions }; saving.value = true; try { const result = isNew.value ? await createProject(project) : await updateProject(String(route.params.slug), project); await router.push(`/projects/${result.project.slug}`) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('projectEditor.saveFailed') } finally { saving.value = false } }
const loadUserOptions = async (query = '') => { usersLoading.value = true; try { userOptions.value = (await searchUsers(query, String(route.params.slug))).users } catch { userOptions.value = [] } finally { usersLoading.value = false } }; const filterUsers = async (value: string, update: (callback: () => void) => void) => { usersLoading.value = true; try { const result = await searchUsers(value.trim(), String(route.params.slug)); update(() => { userOptions.value = result.users }) } catch { update(() => { userOptions.value = [] }) } finally { usersLoading.value = false } }
const invite = async () => { const email = inviteEmail.value.trim().toLowerCase(); inviteMessage.value = ''; if (!email) return; inviting.value = true; try { await inviteProjectMember(String(route.params.slug), email, inviteRole.value); inviteMessage.value = t('projectEditor.inviteSent', { email }); inviteEmail.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : t('projectEditor.inviteFailed') } finally { inviting.value = false } }; const removeMember = async (accountId: string) => { if (!window.confirm(t('projectEditor.confirmRemoveMember'))) return; try { await removeProjectMember(String(route.params.slug), accountId); members.value = members.value.filter((member) => member.accountId !== accountId) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('projectEditor.removeMemberFailed') } }
onMounted(load)
</script>
