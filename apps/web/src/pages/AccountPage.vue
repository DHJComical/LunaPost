<template>
  <q-page class="page-shell account-page q-py-xl">
    <AppPageHeader :eyebrow="t('account.eyebrow')" :title="t('account.settings')" :description="auth.account?.email">
      <template #actions>
        <q-btn outline color="primary" icon="account_circle" :label="t('account.viewPublicProfile')" :to="auth.account ? `/users/${auth.account.id}` : undefined" />
        <q-btn flat icon="refresh" :label="t('account.refresh')" :loading="loading" @click="load" />
      </template>
    </AppPageHeader>
    <AppNotice v-if="error" tone="error" class="q-mb-md">{{ error }}</AppNotice>
    <q-card flat bordered class="account-card">
      <q-card-section class="account-card__body">
        <FormSection :title="t('account.publicProfile')" :description="t('account.publicProfileDesc')">
          <FormGrid>
            <q-input v-model="profileForm.username" outlined :label="t('account.username')" :hint="t('account.usernameHint')" />
            <q-input v-model="profileForm.displayName" outlined :label="t('account.displayName')" />
            <q-input v-model="profileForm.location" outlined :label="t('account.location')" />
            <q-input v-model="profileForm.websiteUrl" outlined :label="t('account.websiteUrl')" type="url" />
            <q-input v-model="profileForm.githubUrl" outlined :label="t('account.githubUrl')" type="url" />
            <q-input v-model="profileForm.avatarUrl" class="form-grid__full" outlined :label="t('account.avatarUrl')" type="url" />
            <q-input v-model="profileForm.bio" class="form-grid__full" outlined type="textarea" autogrow :label="t('account.bio')" />
            <FormActions class="form-grid__full">
              <q-btn color="primary" :label="t('account.saveProfile')" :loading="profileSaving" @click="saveProfile" />
            </FormActions>
          </FormGrid>
        </FormSection>
      </q-card-section>
    </q-card>
    <q-card flat bordered class="account-card">
      <q-card-section class="account-card__body">
        <SectionHeading :title="t('account.minecraftSkin')" :description="t('account.skinDescription')" />
        <div class="row q-col-gutter-md items-start">
          <div class="col-12 col-md-3"><q-img v-if="auth.account?.metadata.skinUrl" :src="auth.account.metadata.skinUrl" ratio="1" fit="contain" class="skin-preview" /><div v-else class="skin-empty">{{ t('account.noSkin') }}</div></div>
          <div class="col-12 col-md-9">
            <FormGrid :columns="1">
              <q-file v-model="skinFile" outlined accept="image/png,image/jpeg" :label="t('account.uploadSkin')" :hint="t('account.imageSizeHint')" :disable="skinUploading" @update:model-value="uploadSkin" />
              <q-file v-model="capeFile" outlined accept="image/png,image/jpeg" :label="t('account.uploadCape')" :hint="t('account.optionalImageSizeHint')" :disable="skinUploading" @update:model-value="uploadCape" />
              <FormActions>
                <q-btn color="primary" :label="t('account.saveSkin')" :loading="skinSaving" @click="saveSkin" />
                <q-btn flat color="negative" :label="t('account.clearSkin')" :disable="skinSaving" @click="clearSkin" />
              </FormActions>
            </FormGrid>
          </div>
        </div>
      </q-card-section>
    </q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.syncMojang')" :description="t('account.syncMojangDesc')"><template #actions><q-btn color="primary" :label="t('account.connectMicrosoft')" :loading="mojangLoading" @click="connectMojang" /></template></SectionHeading></q-card-section></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.favorites')" :description="t('account.favoritesDesc')"><template #actions><q-btn flat icon="refresh" :loading="loading" @click="loadFavorites" /></template></SectionHeading></q-card-section><q-separator /><q-list separator><q-item v-for="project in favorites" :key="project.slug" clickable :to="`/projects/${project.slug}`"><q-item-section avatar><q-avatar size="42px"><q-img v-if="project.iconUrl || project.iconUrls?.[0]" :src="project.iconUrl || project.iconUrls[0]" fit="cover" /><span v-else>{{ project.title.slice(0, 1) }}</span></q-avatar></q-item-section><q-item-section><q-item-label>{{ project.title }}</q-item-label><q-item-label caption>{{ project.description }}</q-item-label></q-item-section><q-item-section side><q-btn flat dense round icon="favorite" color="pink" :aria-label="t('account.removeFavorite')" @click.prevent.stop="removeFavorite(project.slug)" /></q-item-section></q-item><q-item v-if="!favorites.length"><q-item-section class="text-grey-7">{{ t('account.noFavorites') }}</q-item-section></q-item></q-list></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.editorPreferences')" :description="t('account.editorPreferencesDesc')"><template #actions><q-toggle v-model="monacoEnabled" checked-icon="code" unchecked-icon="notes" color="primary" :label="t('account.useMonaco')" /></template></SectionHeading></q-card-section></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.localSettings')" :description="t('account.localSettingsDesc')" /></q-card-section><q-separator /><q-card-section class="row q-col-gutter-md items-center"><div class="col-12 col-md-6"><q-toggle v-model="freezeResults" color="primary" :label="t('account.freezeResults')" /><div class="text-caption text-grey-7">{{ t('account.freezeResultsDesc') }}</div></div><div class="col-12 col-md-6"><q-select v-model="freezePolicy" outlined dense emit-value map-options :label="t('account.freezePolicy')" :disable="!freezeResults" :options="freezePolicyOptions" /></div></q-card-section><q-separator /><q-card-section class="row q-col-gutter-md items-center"><div class="col-12 col-md-6"><q-select v-model="scrollMode" outlined dense emit-value map-options :label="t('account.discoverScrollMode')" :options="scrollModeOptions" /></div><div class="col-12 col-md-6"><div class="text-caption text-grey-7">{{ t('account.scrollModeDesc') }}</div></div></q-card-section></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.organizations')" :description="t('account.organizationsDesc')"><template #actions><q-btn color="primary" outline icon="corporate_fare" :label="t('account.createOrganization')" @click="createOrg" /></template></SectionHeading></q-card-section><q-separator /><q-list separator><q-item v-for="organization in organizations" :key="organization.id" clickable :to="`/organizations/${organization.slug}`"><q-item-section avatar><q-avatar color="primary" text-color="dark">{{ organization.name.slice(0, 1).toUpperCase() }}</q-avatar></q-item-section><q-item-section><q-item-label>{{ organization.name }}</q-item-label><q-item-label caption>@{{ organization.slug }} · {{ organization.description || t('account.noDescription') }}</q-item-label></q-item-section></q-item><q-item v-if="!organizations.length"><q-item-section class="text-grey-7">{{ t('account.noOrganizations') }}</q-item-section></q-item></q-list></q-card>
    <q-card flat bordered class="account-card">
      <q-card-section class="account-card__body"><SectionHeading :title="t('account.apiKeysTitle')" :description="t('account.apiKeysDesc')"><template #actions><q-btn color="primary" :label="t('account.createKey')" @click="create" /></template></SectionHeading></q-card-section>
      <q-separator />
      <q-list separator>
        <q-item v-for="key in keys" :key="key.id">
          <q-item-section><q-item-label>{{ key.name }}</q-item-label><q-item-label caption>{{ key.scopes.join(', ') }} · {{ formatDate(key.createdAt) }}</q-item-label></q-item-section>
          <q-item-section side><q-btn flat dense color="negative" :label="t('account.revoke')" :disable="Boolean(key.revokedAt)" @click="revoke(key.id)" /></q-item-section>
        </q-item>
        <q-item v-if="!keys.length"><q-item-section class="text-grey-7">{{ t('account.noKeys') }}</q-item-section></q-item>
      </q-list>
    </q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.invitations')" /></q-card-section><q-separator /><q-list separator><q-item v-for="invite in invitations" :key="invite.id"><q-item-section><q-item-label>{{ invite.projectSlug }}</q-item-label><q-item-label caption>{{ t('account.role', { role: roleLabel(invite.role) }) }} · {{ formatDate(invite.createdAt) }}</q-item-label></q-item-section><q-item-section side class="row q-gutter-xs"><q-btn dense flat color="primary" :label="t('app.accept')" @click="respond(invite.id, 'accepted')" /><q-btn dense flat color="negative" :label="t('app.reject')" @click="respond(invite.id, 'declined')" /></q-item-section></q-item><q-item v-if="!invitations.length"><q-item-section class="text-grey-7">{{ t('account.noPendingInvitations') }}</q-item-section></q-item></q-list></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading :title="t('account.notifications')" /></q-card-section><q-separator /><q-list separator><q-item v-for="message in notifications" :key="message.id" :class="{ 'bg-blue-1': !message.readAt }" clickable @click="read(message.id)"><q-item-section><q-item-label>{{ message.title }}</q-item-label><q-item-label caption>{{ message.body }}</q-item-label></q-item-section><q-item-section side><span class="text-caption">{{ formatDate(message.createdAt) }}</span></q-item-section></q-item><q-item v-if="!notifications.length"><q-item-section class="text-grey-7">{{ t('account.noNotifications') }}</q-item-section></q-item></q-list></q-card>
    <q-dialog v-model="tokenDialog" persistent><q-card style="min-width: min(520px, 90vw)"><q-card-section><div class="text-h6">{{ t('account.saveKey') }}</div><p class="text-body2">{{ t('account.tokenNotice') }}</p><q-input :model-value="newToken" readonly outlined autogrow><template #append><q-btn flat round icon="content_copy" @click="copyToken" /></template></q-input></q-card-section><q-card-actions align="right"><q-btn color="primary" :label="t('account.saved')" v-close-popup /></q-card-actions></q-card></q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppNotice from '../components/AppNotice.vue'
import AppPageHeader from '../components/AppPageHeader.vue'
import FormActions from '../components/FormActions.vue'
import FormGrid from '../components/FormGrid.vue'
import FormSection from '../components/FormSection.vue'
import SectionHeading from '../components/SectionHeading.vue'
import { createApiKey, createOrganization, listApiKeys, listFavorites, listInvitations, listNotifications, listOrganizations, markNotificationRead, pollMojangDeviceCode, respondInvitation, revokeApiKey, setProjectFavorite, startMojangDeviceCode, updateMinecraftProfile, updateProfile, uploadSkinAsset, type ApiKeySummary, type Invitation, type Notification } from '../lib/account'
import type { Project } from '@andrea/contracts'
import { useMonacoEditor, setMonacoEditor } from '../editorPreferences'
import { discoverFreezePolicy, discoverScrollMode, freezeDiscoverList, setDiscoverFreezePolicy, setDiscoverScrollMode, setFreezeDiscoverList, type DiscoverFreezePolicy, type DiscoverScrollMode } from '../discoverPreferences'
import { useI18n } from '../i18n'

const { t, locale, roleLabel } = useI18n()
const auth = useAuthStore(); const router = useRouter(); const keys = ref<ApiKeySummary[]>([]); const invitations = ref<Invitation[]>([]); const notifications = ref<Notification[]>([]); const organizations = ref<Awaited<ReturnType<typeof listOrganizations>>['organizations']>([]); const favorites = ref<Project[]>([]); const loading = ref(false); const profileSaving = ref(false); const skinUploading = ref(false); const skinSaving = ref(false); const mojangLoading = ref(false); const skinFile = ref<File | null>(null); const capeFile = ref<File | null>(null); const error = ref(''); const tokenDialog = ref(false); const newToken = ref(''); const profileForm = reactive({ username: '', displayName: '', bio: '', avatarUrl: '', websiteUrl: '', githubUrl: '', location: '' }); const monacoEnabled = computed({ get: () => useMonacoEditor.value, set: (value: boolean) => setMonacoEditor(value) })
const freezeResults = computed({ get: () => freezeDiscoverList.value, set: (value: boolean) => setFreezeDiscoverList(value) })
const freezePolicy = computed({ get: () => discoverFreezePolicy.value, set: (value: DiscoverFreezePolicy) => setDiscoverFreezePolicy(value) })
const freezePolicyOptions = computed(() => [{ label: t('account.compareRenderFields'), value: 'deep' }, { label: t('account.compareIdsCount'), value: 'id' }])
const scrollMode = computed({ get: () => discoverScrollMode.value, set: (value: DiscoverScrollMode) => setDiscoverScrollMode(value) })
const scrollModeOptions = computed(() => [{ label: t('account.pageScroll'), value: 'page' }, { label: t('account.resultsScroll'), value: 'results' }])
const formatDate = (value: string) => new Date(value).toLocaleString(locale.value)
const load = async () => { loading.value = true; error.value = ''; try { const [keyResult, invitationResult, notificationResult, organizationResult] = await Promise.all([listApiKeys(), listInvitations(), listNotifications(), listOrganizations()]); keys.value = keyResult.apiKeys; invitations.value = invitationResult.invitations; notifications.value = notificationResult.notifications; organizations.value = organizationResult.organizations; Object.assign(profileForm, { username: auth.account?.metadata.username ?? '', displayName: auth.account?.metadata.displayName ?? '', bio: auth.account?.metadata.bio ?? '', avatarUrl: auth.account?.metadata.avatarUrl ?? '', websiteUrl: auth.account?.metadata.websiteUrl ?? '', githubUrl: auth.account?.metadata.githubUrl ?? '', location: auth.account?.metadata.location ?? '' }) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.readFailed') } finally { loading.value = false } }
const loadFavorites = async () => { try { favorites.value = (await listFavorites()).projects } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.favoritesReadFailed') } }
const removeFavorite = async (slug: string) => { try { await setProjectFavorite(slug, false); favorites.value = favorites.value.filter((project) => project.slug !== slug) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.favoriteRemoveFailed') } }
const saveProfile = async () => { profileSaving.value = true; try { const result = await updateProfile({ ...profileForm, username: profileForm.username.trim() || undefined, avatarUrl: profileForm.avatarUrl || null, websiteUrl: profileForm.websiteUrl || null, githubUrl: profileForm.githubUrl || null, links: [] }); auth.setAccount(result.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.profileSaveFailed') } finally { profileSaving.value = false } }
const uploadSkin = async (value: File | File[] | null) => { const file = Array.isArray(value) ? value[0] : value; if (!file) return; skinUploading.value = true; try { const result = await uploadSkinAsset(file); const response = await updateMinecraftProfile({ skinUrl: result.url, capeUrl: auth.account?.metadata.capeUrl ?? null }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.skinUploadFailed') } finally { skinUploading.value = false } }
const uploadCape = async (value: File | File[] | null) => { const file = Array.isArray(value) ? value[0] : value; if (!file) return; skinUploading.value = true; try { const result = await uploadSkinAsset(file); const response = await updateMinecraftProfile({ skinUrl: auth.account?.metadata.skinUrl ?? null, capeUrl: result.url }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.capeUploadFailed') } finally { skinUploading.value = false } }
const saveSkin = async () => { skinSaving.value = true; try { const response = await updateMinecraftProfile({ skinUrl: auth.account?.metadata.skinUrl ?? null, capeUrl: auth.account?.metadata.capeUrl ?? null }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.skinSaveFailed') } finally { skinSaving.value = false } }
const clearSkin = async () => { skinSaving.value = true; try { const response = await updateMinecraftProfile({ skinUrl: null, capeUrl: null }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.skinClearFailed') } finally { skinSaving.value = false } }
const connectMojang = async () => { mojangLoading.value = true; try { const device = await startMojangDeviceCode(); window.open(device.verification_uri, '_blank', 'noopener'); window.prompt(t('account.mojangPrompt', { code: device.user_code }), device.user_code); const deadline = Date.now() + device.expires_in * 1000; let lastError = ''; while (Date.now() < deadline) { try { const result = await pollMojangDeviceCode(device.device_code); if (result.ok) { await auth.load(); break } } catch (cause) { lastError = cause instanceof Error ? cause.message : '' } await new Promise((resolve) => window.setTimeout(resolve, Math.max(5, device.interval ?? 5) * 1000)) } if (lastError && !auth.account?.metadata.minecraftUuid) error.value = t('account.mojangSyncFailed', { reason: lastError }) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.mojangStartFailed') } finally { mojangLoading.value = false } }
const createOrg = async () => { const name = window.prompt(t('account.organizationNamePrompt')); if (!name?.trim()) return; const slug = window.prompt(t('account.organizationSlugPrompt'), name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); if (!slug?.trim()) return; try { const result = await createOrganization({ name: name.trim(), slug: slug.trim() }); organizations.value.unshift(result.organization) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.organizationCreateFailed') } }
const create = async () => { const name = window.prompt(t('account.keyNamePrompt'), t('account.defaultKeyName')); if (!name?.trim()) return; try { const result = await createApiKey(name.trim()); keys.value.unshift(result.apiKey); newToken.value = result.token; tokenDialog.value = true } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.keyCreateFailed') } }
const revoke = async (id: string) => { if (!window.confirm(t('account.confirmRevoke'))) return; try { await revokeApiKey(id); const key = keys.value.find((item) => item.id === id); if (key) key.revokedAt = new Date().toISOString() } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.keyRevokeFailed') } }
const respond = async (id: string, status: 'accepted' | 'declined') => { try { await respondInvitation(id, status); invitations.value = invitations.value.filter((item) => item.id !== id) } catch (cause) { error.value = cause instanceof Error ? cause.message : t('account.invitationProcessFailed') } }
const read = async (id: string) => { try { await markNotificationRead(id); const item = notifications.value.find((message) => message.id === id); if (item) item.readAt = new Date().toISOString() } catch { /* best effort */ } }
const copyToken = async () => { await navigator.clipboard?.writeText(newToken.value) }
onMounted(async () => { await auth.load(); if (!auth.account) return router.replace('/auth'); await Promise.all([load(), loadFavorites()]) })
</script>

<style scoped>
.account-page > .account-card + .account-card { margin-top: var(--app-space-lg); }
.account-card { border-radius: var(--app-radius-lg); }
.account-card__body { padding: 20px; }
.account-card__body :deep(.section-heading:last-child) { margin-bottom: 0; }
.skin-preview { max-width: 180px; border-radius: 12px; background: var(--q-color-grey-2); }
.skin-empty { min-height: 180px; display: grid; place-items: center; border-radius: 12px; background: var(--q-color-grey-2); color: var(--q-color-grey-7); }
@media (max-width: 600px) { .account-card__body { padding: 16px; } }
</style>
