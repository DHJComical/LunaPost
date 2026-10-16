<template>
  <q-page class="profile-page">
    <div class="profile-shell">
      <q-btn flat dense icon="arrow_back" :label="t('project.back')" to="/" class="profile-back" />
      <q-banner v-if="error" rounded class="bg-red-1 text-red-9 q-mb-md">{{ error }}</q-banner>
      <template v-if="organization">
        <section class="profile-hero"><q-avatar size="104px" class="profile-avatar" color="primary" text-color="dark"><q-img v-if="organization.avatarUrl" :src="organization.avatarUrl" fit="cover" /><span v-else>{{ organization.name.slice(0, 1).toUpperCase() }}</span></q-avatar><div class="profile-identity"><div class="profile-eyebrow">{{ t('organization.eyebrow') }}</div><h1>{{ organization.name }}</h1><div class="profile-handle">@{{ organization.slug }}</div><p :class="{ 'profile-muted': !organization.description }">{{ organization.description || t('organization.noDescription') }}</p><div class="profile-meta"><span><q-icon name="event" /> {{ t('organization.createdAt', { date: formatDate(organization.createdAt) }) }}</span><span><q-icon name="inventory_2" /> {{ t('organization.projectsCount', { count: projects.length }) }}</span><span><q-icon name="people" /> {{ t('organization.membersCount', { count: members.length }) }}</span></div></div></section>
        <div class="profile-layout"><main class="profile-main"><div class="profile-section-heading"><div><div class="profile-eyebrow">{{ t('organization.projectsEyebrow') }}</div><h2>{{ t('organization.projects') }}</h2></div></div><div v-if="projects.length" class="profile-project-grid"><article v-for="project in projects" :key="project.id" class="profile-project-card" @click="router.push(`/projects/${project.slug}`)"><div class="profile-project-icon" :class="{ 'has-image': project.iconUrl || project.iconUrls?.[0] }" :style="project.color ? { background: project.color } : undefined"><q-img v-if="project.iconUrl || project.iconUrls?.[0]" :src="project.iconUrl || project.iconUrls[0]" fit="cover" /><span v-else>{{ project.title.slice(0, 1).toUpperCase() }}</span></div><div class="profile-project-body"><div class="profile-project-title"><h3>{{ project.title }}</h3><span>{{ projectTypeLabel(project.type) }}</span></div><p>{{ project.description }}</p><div class="profile-project-meta"><span><q-icon name="download" /> {{ compactNumber(project.downloads ?? 0) }}</span><span><q-icon name="new_releases" /> {{ t('common.versionsCount', { count: project.versions.length }) }}</span></div></div></article></div><q-card v-else flat bordered class="profile-empty"><q-icon name="inventory_2" size="42px" color="grey-6" /><div class="text-h6 q-mt-sm">{{ t('organization.noProjects') }}</div></q-card></main><aside class="profile-sidebar"><q-card flat bordered class="profile-info-card"><h2>{{ t('organization.members') }}</h2><div v-for="member in members" :key="member.accountId" class="profile-info-row"><q-icon name="person" /><span>{{ member.email.split('@')[0] }} · {{ roleLabel(member.role) }}</span></div></q-card></aside></div>
      </template>
      <q-spinner v-else-if="!error" color="primary" size="2rem" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Organization, Project } from '@andrea/contracts'
import { getOrganization, type OrganizationMember } from '../lib/account'
import { useI18n } from '../i18n'

const { t, locale, projectTypeLabel, roleLabel } = useI18n()
const route = useRoute(); const router = useRouter(); const organization = ref<Organization>(); const members = ref<OrganizationMember[]>([]); const projects = ref<Project[]>([]); const error = ref('')
const formatDate = (value: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value)); const compactNumber = (value: number) => new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
onMounted(async () => { try { const result = await getOrganization(String(route.params.slug)); organization.value = result.organization; members.value = result.members; projects.value = result.projects } catch (cause) { error.value = cause instanceof Error ? cause.message : t('organization.notFound') } })
</script>
