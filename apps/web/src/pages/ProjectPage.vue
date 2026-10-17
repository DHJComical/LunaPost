<template>
  <q-page class="project-page">
    <div class="project-shell">
      <q-btn flat dense icon="arrow_back" :label="t('project.back')" to="/" class="project-back" />
      <q-banner v-if="error" rounded class="bg-red-1 text-red-9 q-mb-md">{{ error }}</q-banner>
      <template v-else-if="project">
        <header class="project-hero">
          <div class="project-hero-main">
            <div class="project-large-icon" :class="{ 'has-image': project.iconUrl || project.iconUrls?.[0] }" :style="project.color ? { background: project.color } : undefined"><q-img v-if="project.iconUrl || project.iconUrls?.[0]" :src="project.iconUrl || project.iconUrls[0]" fit="cover" /><span v-else>{{ project.title.slice(0, 1).toUpperCase() }}</span></div>
            <div class="project-title-block"><div class="project-type-label">{{ projectTypeLabel(project.type) }}</div><h1>{{ project.title }}</h1><p>{{ project.description }}</p><div class="project-hero-stats"><span><q-icon name="download" /> {{ compactNumber(project.downloads ?? 0) }} {{ t('discover.downloads') }}</span><span><q-icon name="favorite_border" /> {{ compactNumber(project.followers ?? 0) }} {{ t('discover.followers') }}</span><q-chip v-if="project.featured" dense color="amber-8" text-color="white">{{ t('discover.featured') }}</q-chip><ProjectStatusBadge v-if="project.status !== 'approved'" :status="project.status" /></div></div>
          </div>
          <div class="project-hero-actions"><q-btn v-if="canEditProject" outline color="primary" icon="edit" :label="t('project.edit')" :to="`/admin/projects/${project.slug}/edit`" /><q-btn v-if="project.versions.length > 1" unelevated color="primary" text-color="dark" icon="download" :label="t('project.download')" :disable="!latestFile" @click="versionDownloadOpen = true" /><q-btn-dropdown v-else unelevated color="primary" text-color="dark" icon="download" :label="t('project.download')" :disable="!latestFile"><q-list dense class="download-source-menu"><q-item v-for="source in (latestVersion && latestFile ? effectiveSources(latestVersion, latestFile) : [])" :key="source.id" clickable v-close-popup tag="a" :href="downloadUrl(latestFile!, source)" target="_blank"><q-item-section><q-item-label>{{ sourceLabel(source) }}</q-item-label><q-item-label caption>{{ source.region }} · {{ source.url }}</q-item-label></q-item-section></q-item></q-list></q-btn-dropdown><q-btn round flat :icon="isFavorite ? 'favorite' : 'favorite_border'" :color="isFavorite ? 'pink' : undefined" :aria-label="t('project.favorite')" :loading="favoriteSaving" @click="toggleFavorite" /></div>
        </header>
        <q-banner v-if="project.status !== 'approved'" dense rounded class="project-status-banner">
          <template #avatar><q-icon name="visibility_off" /></template>
          {{ t('status.privateHint') }}
        </q-banner>

        <div class="project-workspace">
          <main class="project-main-column">
            <q-expansion-item icon="account_tree" :label="t('project.dependenciesPlan')"><DependencyPanel :project="project" /></q-expansion-item>
            <nav class="project-tabs"><button v-if="project.homepageHtml" :class="{ active: activeTab === 'home' }" @click="setTab('home')">{{ t('project.home') }}</button><button :class="{ active: activeTab === 'description' }" @click="setTab('description')">{{ t('project.description') }}</button><button v-if="project.gallery?.length" :class="{ active: activeTab === 'gallery' }" @click="setTab('gallery')">{{ t('project.gallery') }}</button><button :class="{ active: activeTab === 'changelog' }" @click="setTab('changelog')">{{ t('project.changelog') }}</button><button :class="{ active: activeTab === 'versions' }" @click="setTab('versions')">{{ t('project.versions') }}</button><button v-if="wikiAvailable" :class="{ active: activeTab === 'wiki' }" @click="setTab('wiki')">{{ t('project.wiki') }}</button><button v-if="project.licenses?.length" :class="{ active: activeTab === 'licenses' }" @click="setTab('licenses')">{{ t('project.licenses') }}</button><button v-if="embeddedLinks.length" :class="{ active: activeTab === 'embeds' }" @click="setTab('embeds')">{{ t('project.embedded') }}</button><button v-if="githubRepository" :class="{ active: activeTab === 'github-actions' }" @click="setTab('github-actions')">{{ t('project.githubActions') }}</button></nav>
            <section v-if="activeTab === 'home' && project.homepageHtml" class="project-content-card project-home-card"><div class="content-card-toolbar"><span>{{ t('project.home') }}</span><q-btn v-if="!isStatic" flat dense icon="open_in_new" :label="t('project.open')" :href="siteUrl" target="_blank" /></div><iframe :src="isStatic ? undefined : siteUrl" :srcdoc="isStatic ? project.homepageHtml : undefined" class="project-homepage" sandbox="allow-same-origin" :title="t('project.homepageFrameTitle')" /></section>
            <section v-else-if="activeTab === 'description'" class="project-content-card"><div v-if="project.body" class="project-markdown" v-html="markdownToHtml(project.body, { repositoryUrl: project.repositoryUrl || project.sourceUrl, theme: resolvedTheme })" /><div v-else class="project-markdown project-muted">{{ t('project.noDescription') }}</div><div v-if="project.gallery?.length" class="project-gallery"><q-img v-for="(image, index) in project.gallery" :key="image" :src="image" ratio="16/9" fit="cover" @click="openGallery(index)" /></div></section>
            <section v-else-if="activeTab === 'gallery' && project.gallery?.length" class="project-content-card project-gallery-card"><div class="content-card-toolbar"><span>{{ t('project.gallery') }}</span><small>{{ project.gallery.length }} {{ t('project.galleryImages') }}</small></div><div class="project-gallery project-gallery-expanded"><q-img v-for="(image, index) in project.gallery" :key="image" :src="image" :alt="t('project.imageAlt', { title: project.title, number: index + 1 })" ratio="4/3" fit="cover" loading="lazy" @click="openGallery(index)" /></div></section>
            <section v-else-if="activeTab === 'licenses' && project.licenses?.length" class="project-content-card project-licenses-card">
              <div class="content-card-toolbar"><span>{{ t('project.licenseFiles') }}</span><small>{{ project.licenses.length }} {{ t('project.licenses') }}</small></div>
              <q-tabs v-model="licenseTab" dense inline-label no-caps align="left" class="license-tabs">
                <q-tab v-for="license in project.licenses" :key="license.id" :name="license.id" :label="license.name || t('project.license')" icon="description" />
              </q-tabs>
              <q-tab-panels v-model="licenseTab" animated>
                <q-tab-panel v-for="license in project.licenses" :key="license.id" :name="license.id">
                  <div class="license-heading">
                    <div class="license-file-meta">
                      <h2>{{ license.fileName || license.name || t('project.license') }}</h2>
                      <span v-if="license.spdx" class="license-spdx">{{ license.spdx }}</span>
                    </div>
                    <q-btn v-if="license.url" flat dense no-caps class="license-source-link" icon-right="open_in_new" :label="t('project.openLicense')" :href="license.url" target="_blank" rel="noopener noreferrer" />
                  </div>
                  <pre v-if="license.text" class="license-text" tabindex="0" :aria-label="`${license.name || t('project.license')} ${t('project.openLicense')}`">{{ license.text }}</pre>
                  <div v-else class="project-muted license-empty">{{ t('project.licenseEmpty') }}</div>
                </q-tab-panel>
              </q-tab-panels>
            </section>
            <section v-else-if="activeTab === 'changelog'" class="project-content-card"><div v-if="project.versions.length" class="changelog-list"><article v-for="version in project.versions" :key="version.id" class="changelog-item"><div class="changelog-dot" :class="version.type" /><div><div class="changelog-title"><strong>{{ version.version }}</strong><q-badge :color="version.type === 'release' ? 'positive' : 'orange'" :label="versionTypeLabel(version.type)" /><span>{{ formatDate(version.publishedAt) }}</span></div><div v-if="version.description" class="version-description">{{ version.description }}</div><div class="project-markdown" v-html="markdownToHtml(version.changelog || t('project.noChangelog'), { repositoryUrl: project.repositoryUrl || project.sourceUrl, theme: resolvedTheme })" /></div></article></div><div v-else class="project-muted">{{ t('project.noChangelog') }}</div></section>
            <section v-else-if="activeTab === 'wiki' && wikiAvailable" class="project-content-card project-wiki-card"><div class="content-card-toolbar"><span>{{ t('project.wiki') }}</span><q-btn v-if="project.wikiUrl" flat dense icon="open_in_new" :label="t('project.openWiki')" :href="project.wikiUrl" target="_blank" /></div><iframe :src="project.wikiHtml ? undefined : project.wikiUrl" :srcdoc="project.wikiHtml || undefined" class="project-wiki-frame" sandbox="allow-same-origin" :title="t('project.wiki')" /></section>
            <section v-else-if="activeTab === 'embeds' && embeddedLinks.length" class="project-content-card project-embeds-card"><div v-for="link in embeddedLinks" :key="link.id || link.url" class="project-embed-block"><div class="content-card-toolbar"><span><q-icon :name="link.icon || 'web'" /> {{ link.label }}</span><q-btn flat dense icon="open_in_new" :label="t('project.openWindow')" :href="link.url" target="_blank" /></div><iframe :src="link.url" class="project-embed-frame" :style="{ height: `${link.embedHeight ?? 520}px` }" sandbox="allow-scripts allow-same-origin" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" :title="link.label" /></div></section>
            <section v-else-if="activeTab === 'github-actions' && githubRepository" class="project-content-card project-github-actions-card"><GitHubArtifacts :owner="githubRepository.owner" :repo="githubRepository.repo" /></section>
            <section v-else class="project-content-card"><div class="versions-toolbar"><div><strong>{{ t('project.versionsTitle') }}</strong><span>{{ project.versions.length }} {{ t('project.versions') }}</span></div><div class="row q-gutter-sm"><q-select v-model="versionTypeFilter" dense outlined clearable options-dense :label="t('project.versionType')" :options="versionTypeOptions" behavior="menu" popup-content-class="version-filter-menu" /><q-select v-model="versionFilter" dense outlined clearable options-dense :label="t('project.gameVersion')" :options="project.gameVersions" behavior="menu" popup-content-class="version-filter-menu" /><q-select v-model="loaderFilter" dense outlined clearable options-dense :label="t('project.loader')" :options="project.loaders" behavior="menu" popup-content-class="version-filter-menu" /></div></div><div class="version-table"><div v-for="version in filteredVersions" :key="version.id" class="version-row"><div class="version-dot" :class="version.type">{{ version.type.slice(0, 1).toUpperCase() }}</div><div class="version-name"><strong>{{ version.version }}</strong><span>{{ version.gameVersions.join(', ') }} · {{ version.loaders.join(', ') }}</span><small v-if="version.description">{{ version.description }}</small></div><div class="version-date">{{ formatDate(version.publishedAt) }}</div><div class="version-downloads">{{ version.files.length }} {{ t('project.files') }}</div><q-btn-dropdown flat dense color="primary" icon="download"  :label="t('project.download')"><q-list dense class="download-source-menu"><q-item v-for="file in version.files" :key="file.id" class="download-file-group"><q-item-section><q-item-label>{{ file.name }}</q-item-label><q-item-label v-if="file.description" caption>{{ file.description }}</q-item-label></q-item-section><q-item-section side><div class="row no-wrap"><q-btn v-for="source in effectiveSources(version, file)" :key="source.id" flat dense size="sm" :label="sourceLabel(source)" :href="downloadUrl(file, source)" target="_blank" v-close-popup /></div></q-item-section></q-item></q-list></q-btn-dropdown></div><div v-if="!filteredVersions.length" class="project-muted q-pa-lg">{{ t('project.noMatchingVersions') }}</div></div></section>
          </main>
          <aside class="project-sidebar">
            <section class="sidebar-card"><h2>{{ t('project.compatibility') }}</h2><div class="sidebar-label">{{ t('project.minecraftJavaEdition') }}</div><div class="sidebar-tags"><q-chip v-for="version in project.gameVersions" :key="version" dense>{{ version }}</q-chip></div><div class="sidebar-label">{{ t('project.platforms') }}</div><div class="sidebar-tags"><q-chip v-for="loader in project.loaders" :key="loader" dense color="orange-2" text-color="orange-10">{{ loader }}</q-chip></div><div class="sidebar-label">{{ t('project.environments') }}</div><div class="sidebar-tags"><q-chip dense icon="desktop_windows">{{ t('project.client') }} · {{ environmentLabel(project.clientSide) }}</q-chip><q-chip dense icon="dns">{{ t('project.server') }} · {{ environmentLabel(project.serverSide) }}</q-chip></div></section>
            <section class="sidebar-card"><h2>{{ t('project.links') }}</h2><a v-if="project.issuesUrl" :href="project.issuesUrl" target="_blank"><q-icon name="warning_amber" /> {{ t('project.reportIssues') }} <q-icon name="open_in_new" /></a><a v-if="project.sourceUrl || project.repositoryUrl" :href="project.sourceUrl || project.repositoryUrl" target="_blank"><q-icon name="code" /> {{ t('project.viewSource') }} <q-icon name="open_in_new" /></a><a v-if="wikiAvailable" href="#" @click.prevent="openWiki"><q-icon name="menu_book" /> {{ t('project.visitWiki') }} <q-icon name="open_in_new" /></a><a v-if="project.discordUrl" :href="project.discordUrl" target="_blank"><q-icon name="forum" /> {{ t('project.joinDiscord') }} <q-icon name="open_in_new" /></a><a v-for="link in project.links?.filter((item) => !item.embed)" :key="link.id || link.url" :href="link.url" target="_blank"><q-icon :name="link.icon || 'link'" /> {{ link.label }} <q-icon name="open_in_new" /></a><a v-for="link in embeddedLinks" :key="`embed-${link.id || link.url}`" href="#" @click.prevent="openEmbeds"><q-icon :name="link.icon || 'web'" /> {{ link.label }} <q-badge color="primary"  :label="t('project.embedded')" /></a><div v-if="project.donationUrls?.length" class="sidebar-donations"><a v-for="donation in project.donationUrls" :key="donation.url" :href="donation.url" target="_blank"><q-icon name="favorite" /> {{ donation.platform }}</a></div></section>
            <section v-if="project.categories?.length || project.keywords?.length" class="sidebar-card"><h2>{{ t('project.tags') }}</h2><div class="sidebar-tags"><q-chip v-for="tag in [...(project.categories ?? []), ...(project.keywords ?? [])]" :key="tag" dense>{{ categoryLabel(tag) }}</q-chip></div></section>
            <section v-if="members.length" class="sidebar-card"><h2>{{ t('project.creators') }}</h2><router-link v-for="member in members" :key="member.accountId" :to="`/users/${member.accountId}`" class="creator-row creator-link"><q-avatar size="30px" color="primary" text-color="dark">{{ member.email.slice(0, 1).toUpperCase() }}</q-avatar><div><strong>{{ member.email.split('@')[0] }}</strong><small>{{ roleLabels[member.role] ? t(roleLabels[member.role]) : member.role }}</small></div></router-link></section>
            <section class="sidebar-card"><h2>{{ t('project.details') }}</h2><div class="detail-row"><q-icon name="copyright" /> {{ t('project.licensed') }} {{ project.licenses?.map((license) => license.spdx || license.name).join(', ') || project.license || t('project.noLicense') }}</div><div class="detail-row"><q-icon name="event" /> {{ t('project.published') }} {{ formatDate(project.versions.at(-1)?.publishedAt) }}</div><div class="detail-row"><q-icon name="update" /> {{ t('project.updated') }} {{ formatDate(project.versions[0]?.publishedAt) }}</div></section>
          </aside>
        </div>
      </template>
      <q-spinner v-else color="primary" size="2rem" />
    </div>
    <q-dialog v-model="galleryOpen" maximized transition-show="fade" transition-hide="fade" @keydown.esc="galleryOpen = false">
      <div class="gallery-lightbox" tabindex="0" @keydown.left.prevent="previousGallery" @keydown.right.prevent="nextGallery">
        <q-btn round flat icon="close" color="white" class="gallery-lightbox-close" :aria-label="t('project.closePreview')" @click="galleryOpen = false" />
        <q-btn v-if="galleryImages.length > 1" round flat icon="chevron_left" color="white" class="gallery-lightbox-prev" :aria-label="t('project.previousImage')" @click="previousGallery" />
        <q-img v-if="galleryImages[galleryIndex]" :src="galleryImages[galleryIndex]" fit="contain" class="gallery-lightbox-image" :alt="t('project.imageAlt', { title: project?.title ?? t('project.title'), number: galleryIndex + 1 })" />
        <q-btn v-if="galleryImages.length > 1" round flat icon="chevron_right" color="white" class="gallery-lightbox-next" :aria-label="t('project.nextImage')" @click="nextGallery" />
        <div v-if="galleryImages.length > 1" class="gallery-lightbox-counter">{{ galleryIndex + 1 }} / {{ galleryImages.length }}</div>
      </div>
    </q-dialog>
    <q-dialog v-model="versionDownloadOpen">
      <q-card class="version-download-dialog">
        <q-card-section class="row items-center justify-between"><div><div class="text-h6">{{ t('project.selectVersion') }}</div><div class="text-caption text-grey-7">{{ t('project.selectVersionHint') }}</div></div><q-btn flat round dense icon="close" v-close-popup /></q-card-section>
        <q-separator />
        <q-list separator><q-item v-for="version in project?.versions" :key="version.id" class="version-download-option"><q-item-section><q-item-label class="text-weight-bold">{{ version.version }}</q-item-label><q-item-label caption>{{ version.gameVersions.join(', ') || t('project.noGameVersion') }} · {{ version.loaders.join(', ') || t('project.noLoader') }}</q-item-label><q-item-label v-if="version.description" caption>{{ version.description }}</q-item-label></q-item-section><q-item-section side><div v-for="file in version.files" :key="file.id" class="version-download-file"><span>{{ file.name }}</span><q-btn-dropdown flat dense color="primary" icon="download"  :label="t('project.download')"><q-list dense class="download-source-menu"><q-item v-for="source in effectiveSources(version, file)" :key="source.id" clickable v-close-popup tag="a" :href="downloadUrl(file, source)" target="_blank"><q-item-section><q-item-label>{{ sourceLabel(source) }}</q-item-label><q-item-label caption>{{ source.region }}</q-item-label></q-item-section></q-item></q-list></q-btn-dropdown></div></q-item-section></q-item></q-list>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Project, Source, Version, FileRecord, ProjectLink } from '@andrea/contracts'
import { getProject } from '../lib/api'
import DependencyPanel from '../components/DependencyPanel.vue'
import { listProjectMembers, type ProjectMember } from '../lib/admin'
import { useI18n } from '../i18n'
import { markdownToHtml } from '../lib/markdown'
import { useTheme } from '../theme'
import { getProjectFavorite, setProjectFavorite } from '../lib/account'
import { useAuthStore } from '../stores/auth'
import ProjectStatusBadge from '../components/ProjectStatusBadge.vue'
import GitHubArtifacts from '../components/GitHubArtifacts.vue'

const { resolvedTheme } = useTheme()
const route = useRoute(); const router = useRouter(); const auth = useAuthStore(); const { t, locale, projectTypeLabel, versionTypeLabel } = useI18n(); const isStatic = import.meta.env.VITE_STATIC_MODE === 'true'; const project = ref<Project>(); const members = ref<ProjectMember[]>([]); const error = ref(''); const isFavorite = ref(false); const favoriteSaving = ref(false); const activeTab = ref<'home' | 'description' | 'gallery' | 'changelog' | 'versions' | 'wiki' | 'licenses' | 'embeds' | 'github-actions'>('description'); const licenseTab = ref(''); const galleryOpen = ref(false); const galleryIndex = ref(0); const versionDownloadOpen = ref(false); const versionFilter = ref<string | null>(null); const versionTypeFilter = ref<{ label: string; value: string } | null>(null); const loaderFilter = ref<string | null>(null)
const categoryKeys = ['adventure', 'optimization', 'technology', 'magic', 'decoration', 'library', 'utility', 'storage', 'worldgen', 'food', 'social']; const categoryLabel = (value: string) => categoryKeys.includes(value) ? t(`category.${value}`) : value
const roleLabels: Record<string, string> = { owner: 'project.role.owner', admin: 'project.role.admin', editor: 'project.role.editor', reviewer: 'project.role.reviewer', member: 'project.role.member' }; const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const siteUrl = computed(() => `${apiBase}/api/v1/projects/${encodeURIComponent(project.value?.slug ?? '')}/site`); const compactNumber = (value: number) => new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(value); const environmentLabel = (value: string | undefined) => ({ required: t('common.required'), optional: t('common.optional'), unsupported: t('common.unsupported'), unknown: t('common.unknown') }[value ?? 'unknown'] ?? value); const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value)) : t('project.noRecord')
// The model holds the whole option object: Quasar renders the closed field from the option it receives, so keeping the object is
// what lets the localized label show up. The filter compares the enum member inside it.
const versionTypeOptions = computed(() => [{ label: t('project.versionType.release'), value: 'release' }, { label: t('project.versionType.beta'), value: 'beta' }, { label: t('project.versionType.alpha'), value: 'alpha' }])
const latestVersion = computed(() => project.value?.versions?.[0]); const latestFile = computed(() => latestVersion.value?.files?.find((file) => file.primary) ?? latestVersion.value?.files?.[0]); const filteredVersions = computed(() => project.value?.versions.filter((version) => (!versionTypeFilter.value || version.type === versionTypeFilter.value.value) && (!versionFilter.value || version.gameVersions.includes(versionFilter.value)) && (!loaderFilter.value || version.loaders.includes(loaderFilter.value))) ?? [])
const canEditProject = computed(() => Boolean((project.value as (Project & { canEdit?: boolean }) | undefined)?.canEdit || (project.value && auth.account && (['root', 'admin'].includes(auth.account.role) || project.value.ownerId === auth.account.id || members.value.some((member) => member.accountId === auth.account?.id && ['owner', 'admin', 'editor'].includes(member.role))))))
const wikiAvailable = computed(() => Boolean(project.value?.wikiUrl || project.value?.wikiHtml))
const githubRepository = computed(() => {
  const source = project.value?.repositoryUrl || project.value?.sourceUrl
  if (!source) return null
  try {
    const url = new URL(source)
    if (url.hostname.toLowerCase() !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/, '')
    if (!owner || !repo) return null
    return { owner, repo }
  } catch {
    return null
  }
})
const isEmbeddableLink = (link: ProjectLink) => { if (!link.embed) return false; try { return ['http:', 'https:'].includes(new URL(link.url).protocol) } catch { return false } }
const embeddedLinks = computed(() => (project.value?.links ?? []).filter(isEmbeddableLink))
const galleryImages = computed(() => project.value?.gallery ?? [])
const openGallery = (index: number) => { galleryIndex.value = index; galleryOpen.value = true }
const previousGallery = () => { if (galleryImages.value.length) galleryIndex.value = (galleryIndex.value - 1 + galleryImages.value.length) % galleryImages.value.length }
const nextGallery = () => { if (galleryImages.value.length) galleryIndex.value = (galleryIndex.value + 1) % galleryImages.value.length }
const effectiveSources = (version: Version, file: FileRecord): Source[] => {
  const rules = (project.value?.cdnRules ?? []).filter((rule) => rule.enabled).flatMap((rule) => {
    const values: Record<string, string> = { fileId: file.id, filename: file.name, projectSlug: project.value?.slug ?? '', versionId: version.id, version: version.version }
    const url = rule.template.replace(/\{(fileId|filename|projectSlug|versionId|version)\}/g, (_, key: string) => encodeURIComponent(values[key]))
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) return []; return [{ id: rule.id, kind: 'cdn' as const, region: rule.region, url: parsed.href, priority: rule.priority }] } catch { return [] }
  })
  const ids = new Set(file.sources.map((source) => source.id))
  return [...file.sources, ...rules.filter((source) => !ids.has(source.id))]
}
const sourceLabel = (source: Source) => source.kind === 'cdn' ? t('project.sourceCdn', { region: source.region }) : source.region === 'GLOBAL' ? source.kind === 'managed' ? t('project.sourceManaged') : t('project.sourceDefault') : t('project.sourceMirror', { region: source.region })
const downloadUrl = (file: FileRecord, source?: Source) => {
  if (import.meta.env.VITE_STATIC_MODE === 'true' && source?.url) return source.url
  const suffix = source?.id ? `?source=${encodeURIComponent(source.id)}` : ''
  return `${apiBase}/api/v1/files/${encodeURIComponent(file.id)}/download${suffix}`
}
// The open tab lives in the URL, so a reload or a shared link keeps the same workspace tab. The bare project path means the
// default tab, which keeps existing links working.
const TAB_KEYS = ['home', 'description', 'gallery', 'changelog', 'versions', 'wiki', 'licenses', 'embeds', 'github-actions'] as const
type ProjectTab = typeof TAB_KEYS[number]
const tabFromRoute = () => {
  const value = String(route.params.tab ?? '')
  return (TAB_KEYS as readonly string[]).includes(value) ? value as ProjectTab : null
}
const defaultTab = (): ProjectTab => (project.value?.homepageHtml ? 'home' : 'description')
// A key can be valid in the URL yet not exist for this project (no homepage, no gallery, ...), so availability is checked too.
const tabAvailable = (tab: ProjectTab) => {
  const current = project.value
  if (!current) return false
  if (tab === 'home') return Boolean(current.homepageHtml)
  if (tab === 'gallery') return Boolean(current.gallery?.length)
  if (tab === 'wiki') return Boolean(current.wikiUrl || current.wikiHtml)
  if (tab === 'licenses') return Boolean(current.licenses?.length)
  if (tab === 'embeds') return embeddedLinks.value.length > 0
  if (tab === 'github-actions') return Boolean(githubRepository.value)
  return true
}
const setTab = (tab: ProjectTab) => {
  activeTab.value = tab
  const slug = String(route.params.slug)
  const current = tabFromRoute()
  if (current === tab) return
  // The default tab keeps the short URL; other tabs carry their key.
  void router.replace({ path: tab === defaultTab() ? `/projects/${slug}` : `/projects/${slug}/${tab}` })
}
const applyRouteTab = () => {
  const tab = tabFromRoute()
  if (!tab || !tabAvailable(tab)) { activeTab.value = defaultTab(); return }
  activeTab.value = tab
}
const openWiki = () => setTab('wiki')
const openEmbeds = () => setTab('embeds')
watch(() => route.params.tab, () => { if (project.value) applyRouteTab() })
const toggleFavorite = async () => { if (!auth.account) { error.value = t('project.pleaseSignInToFavorite'); return }; if (!project.value) return; favoriteSaving.value = true; try { const result = await setProjectFavorite(project.value.slug, !isFavorite.value); isFavorite.value = result.favorite; project.value.followers = result.count } catch (cause) { error.value = cause instanceof Error ? cause.message : t('project.favoriteFailed') } finally { favoriteSaving.value = false } }
onMounted(async () => { try { await auth.load(); project.value = await getProject(String(route.params.slug)); applyRouteTab(); licenseTab.value = project.value.licenses?.[0]?.id ?? ''; members.value = (await listProjectMembers(String(route.params.slug))).members; if (!isStatic && auth.account) { const result = await getProjectFavorite(project.value.slug); isFavorite.value = result.favorite } } catch { error.value = t('project.notFound') } })
</script>
