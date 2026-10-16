<template>
  <main class="results-panel">
    <div class="results-toolbar">
      <div><strong>{{ t('discover.projects', { count: total }) }}</strong> <span v-if="filters.query">{{ t('discover.matches', { query: filters.query }) }}</span></div>
      <div class="toolbar-controls">
        <q-select v-model="filters.sort" dense outlined emit-value map-options :options="sortOptions" @update:model-value="fetchProjects" />
        <q-btn-toggle v-model="viewMode" class="view-toggle" dense unelevated toggle-color="primary" :options="[{ label: t('discover.listView'), value: 'list', icon: 'view_list' }, { label: t('discover.gridView'), value: 'grid', icon: 'grid_view' }]" />
      </div>
    </div>
    <!-- Two mutually exclusive groups: one cross-fades the banner/spinner/empty state, the other animates the cards themselves. -->
    <TransitionGroup name="results-swap" tag="div" class="results-body" mode="out-in">
      <AppNotice v-if="error" key="error" tone="error" class="q-mb-md">{{ t('discover.apiError') }}</AppNotice>
      <div v-else-if="loading" key="loading" class="results-loading"><q-spinner color="primary" size="2.5rem" /></div>
      <AppEmptyState v-else-if="!projects.length" key="empty" icon="search_off" :title="t('discover.noResults')" :description="t('discover.tryAgain')">
        <template #actions><q-btn flat color="primary" :label="t('discover.clearFilters')" @click="clearFilters" /></template>
      </AppEmptyState>
    </TransitionGroup>
    <TransitionGroup v-if="!error && !loading && projects.length" key="results" tag="div" name="card-item" :class="viewMode === 'grid' ? 'project-grid' : 'project-list'" @pointermove="moveCardGlow" @pointerleave="clearCardGlow">
      <article v-for="project in projects" :key="project.id" class="discover-card" @click="openProject(project.slug)">
        <div class="discover-card-icon" :class="{ 'has-image': project.iconUrl || project.iconUrls?.[0] }" :style="project.color ? { background: project.color } : undefined"><q-img v-if="project.iconUrl || project.iconUrls?.[0]" :src="project.iconUrl || project.iconUrls[0]" fit="cover" /><span v-else>{{ project.title.slice(0, 1).toUpperCase() }}</span></div>
        <div class="discover-card-content"><div class="discover-card-title"><h2>{{ project.title }}</h2><q-badge v-if="project.featured" color="amber-8" :label="t('discover.featured')" /><ProjectStatusBadge :status="project.status" /><span class="project-author">{{ project.slug }}</span></div><p>{{ project.description }}</p><div class="metadata-row"><q-chip v-for="tag in project.categories?.slice(0, 3)" :key="'cat-' + tag" dense class="metadata-chip category-chip">{{ categoryLabel(tag) }}</q-chip><q-chip v-for="loader in project.loaders?.slice(0, 3)" :key="'loader-' + loader" dense class="metadata-chip">{{ loader }}</q-chip><q-chip v-for="version in project.gameVersions?.slice(0, 2)" :key="'version-' + version" dense class="metadata-chip">{{ version }}</q-chip></div><div class="environment-row"><span><q-icon name="desktop_windows" /> {{ environmentLabel(project.clientSide) }}</span><span><q-icon name="dns" /> {{ environmentLabel(project.serverSide) }}</span><span v-if="project.license"><q-icon name="copyright" /> {{ project.license }}</span></div></div>
        <div class="discover-card-stats"><span><q-icon name="download" /> {{ formatNumber(project.downloads || 0) }}</span><span><q-icon name="favorite_border" /> {{ formatNumber(project.followers || 0) }}</span><span><q-icon name="inventory_2" /> {{ t('discover.versions', { count: project.versions?.length ?? 0 }) }}</span></div>
      </article>
    </TransitionGroup>
    <div v-if="total > pageSize" class="catalog-pagination"><q-pagination :model-value="page" :max="Math.ceil(total / pageSize)" direction-links boundary-links color="primary" @update:model-value="setPage" /></div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../i18n'
import AppEmptyState from './AppEmptyState.vue'
import AppNotice from './AppNotice.vue'
import ProjectStatusBadge from './ProjectStatusBadge.vue'
import { clearFilters, error, fetchProjects, filters, loading, page, pageSize, projects, setPage, total, viewMode } from '../lib/discover'

const { t, locale } = useI18n()
const router = useRouter()
const sortOptions = computed(() => [{ label: t('discover.relevance'), value: 'relevance' }, { label: t('discover.downloads'), value: 'downloads' }, { label: t('discover.followers'), value: 'followers' }, { label: t('discover.updated'), value: 'updated' }])
const categories = ['adventure', 'optimization', 'technology', 'magic', 'decoration', 'library', 'utility', 'storage', 'worldgen', 'food', 'social']
const categoryLabel = (value: string) => categories.includes(value) ? t(`category.${value}`) : value
const environmentLabel = (value: string | undefined) => ({ required: t('common.required'), optional: t('common.optional'), unsupported: t('common.unsupported'), unknown: t('common.unknown') }[value ?? 'unknown'] ?? value)
const formatNumber = (value: number) => new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const openProject = (slug: string) => router.push('/projects/' + slug)

// The pointer glow is a presentation detail, so it stays with the markup that draws the cards.
let activeGlowCard: HTMLElement | null = null
const moveCardGlow = (event: PointerEvent) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.discover-card')
  if (!card) return
  if (activeGlowCard && activeGlowCard !== card) activeGlowCard.classList.remove('glow-active')
  activeGlowCard = card
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`)
  card.classList.add('glow-active')
}
const clearCardGlow = () => { activeGlowCard?.classList.remove('glow-active'); activeGlowCard = null }
</script>
