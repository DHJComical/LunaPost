<template>
  <q-layout view="hHh Lpr lFf" class="app-layout">
    <q-header class="site-header">
      <q-toolbar class="header-shell">
        <router-link to="/" class="brand" :aria-label="siteName"><span class="brand-mark" :class="{ 'has-image': Boolean(siteIconUrl) }"><q-img v-if="siteIconUrl" :src="siteIconUrl" fit="contain" :alt="siteName" /><q-icon v-else name="hub" /></span><span class="brand-name">{{ siteName }}</span></router-link>
        <div class="desktop-nav">
          <q-btn flat no-caps class="nav-link" :class="{ 'nav-link-active': route.path === '/' }" icon="explore" :label="t('nav.discover')" to="/" />
          <q-btn v-if="auth.canPublish" flat no-caps class="nav-link" :class="{ 'nav-link-active': route.path === '/admin' || route.path.startsWith('/admin/projects/') }" icon="cloud_upload" :label="t('nav.host')" to="/admin/projects/new" />
          <q-btn flat no-caps class="nav-link" :class="{ 'nav-link-active': route.path === '/api' }" icon="code" :label="t('nav.api')" to="/api" />
        </div>
        <q-space />
        <div class="desktop-actions">
          <q-btn-dropdown flat no-caps class="theme-button" dropdown-icon="expand_more" :icon="isDark ? 'dark_mode' : 'light_mode'" :label="themeLabel">
            <q-list dense class="language-menu"><q-item-label header>{{ t('nav.theme') }}</q-item-label><q-item v-for="item in themeOptions" :key="item.value" clickable v-close-popup :active="themeMode === item.value" active-class="language-active" @click="setThemeMode(item.value)"><q-item-section avatar><q-icon :name="item.icon" /></q-item-section><q-item-section>{{ item.label }}</q-item-section><q-item-section side><q-icon v-if="themeMode === item.value" name="check" color="primary" /></q-item-section></q-item></q-list>
          </q-btn-dropdown>
          <q-btn-dropdown flat no-caps class="language-button" dropdown-icon="expand_more" :label="languageLabel">
            <q-list dense class="language-menu"><q-item-label header>{{ t('nav.language') }}</q-item-label><q-item v-for="item in localeOptions" :key="item.value" clickable v-close-popup :active="locale === item.value" active-class="language-active" @click="setLocale(item.value)"><q-item-section>{{ item.label }}</q-item-section><q-item-section side><q-icon v-if="locale === item.value" name="check" color="primary" /></q-item-section></q-item></q-list>
          </q-btn-dropdown>
          <template v-if="auth.loaded && auth.account">
            <div class="notification-wrap" @mouseenter="notificationOpen = true"><q-btn flat round dense class="notification-button" icon="notifications" :aria-label="t('app.notifications')" @click="notificationOpen = !notificationOpen"><q-badge v-if="unreadCount" floating rounded color="negative">{{ unreadCount > 99 ? '99+' : unreadCount }}</q-badge></q-btn><q-menu v-model="notificationOpen" anchor="bottom middle" self="top middle" :offset="[0, 10]" class="notification-menu" @show="loadNotifications"><div class="notification-menu-inner"><div class="notification-menu-heading"><strong>{{ t('app.notifications') }}</strong><q-btn flat dense round icon="refresh" :loading="notificationsLoading" @click="loadNotifications" /></div><q-list v-if="notifications.length || invitations.length" separator><q-item v-for="message in notifications" :key="`notification-${message.id}`" clickable @click="readNotification(message.id)"><q-item-section avatar><q-icon :name="message.readAt ? 'notifications_none' : 'notifications_active'" :color="message.readAt ? 'grey-6' : 'primary'" /></q-item-section><q-item-section><q-item-label :class="{ 'text-weight-bold': !message.readAt }">{{ message.title }}</q-item-label><q-item-label caption>{{ message.body || t('app.noDetails') }}</q-item-label><q-item-label caption>{{ formatNotificationDate(message.createdAt) }}</q-item-label></q-item-section></q-item><q-item v-for="invitation in invitations" :key="`invitation-${invitation.id}`"><q-item-section avatar><q-icon name="group_add" color="primary" /></q-item-section><q-item-section><q-item-label class="text-weight-bold">{{ t('app.projectInvitation') }}</q-item-label><q-item-label caption>{{ invitation.email }} · {{ roleLabel(invitation.role) }} · {{ invitation.projectSlug }}</q-item-label><div class="row q-gutter-xs q-mt-sm"><q-btn dense size="sm" color="primary" :label="t('app.accept')" @click="respondToInvitation(invitation.id, 'accepted')" /><q-btn dense size="sm" flat color="negative" :label="t('app.reject')" @click="respondToInvitation(invitation.id, 'declined')" /></div></q-item-section></q-item></q-list><div v-else class="notification-empty"><q-icon name="notifications_none" size="28px" /><span>{{ t('app.noNewNotifications') }}</span></div><div class="notification-menu-footer"><q-btn flat dense no-caps :label="t('app.viewAllMessages')" to="/account" v-close-popup /></div></div></q-menu></div>
            <q-btn-dropdown unelevated no-caps color="primary" text-color="dark" class="account-button" dropdown-icon="expand_more" :label="accountLabel">
              <q-list dense style="min-width: 190px"><q-item clickable v-close-popup :to="`/users/${auth.account.id}`"><q-item-section avatar><q-icon name="account_circle" /></q-item-section><q-item-section>{{ t('app.publicProfile') }}</q-item-section></q-item><q-item clickable v-close-popup to="/account"><q-item-section avatar><q-icon name="person" /></q-item-section><q-item-section>{{ t('nav.account') }}</q-item-section></q-item><q-item v-if="auth.canPublish" clickable v-close-popup to="/admin"><q-item-section avatar><q-icon name="admin_panel_settings" /></q-item-section><q-item-section>{{ t('nav.admin') }}</q-item-section></q-item><q-separator /><q-item clickable v-close-popup @click="auth.signOut"><q-item-section avatar><q-icon name="logout" /></q-item-section><q-item-section>{{ t('nav.signOut') }}</q-item-section></q-item></q-list>
            </q-btn-dropdown>
          </template>
          <q-btn v-else unelevated no-caps color="primary" text-color="dark" class="signin-button" :label="t('nav.signIn')" to="/auth" />
        </div>
        <q-btn flat round dense class="mobile-menu-button" icon="menu" :aria-label="t('nav.menu')"><q-menu anchor="bottom right" self="top right"><q-list dense style="min-width: 220px"><q-item clickable v-close-popup to="/"><q-item-section avatar><q-icon name="explore" /></q-item-section><q-item-section>{{ t('nav.discover') }}</q-item-section></q-item><q-item v-if="auth.canPublish" clickable v-close-popup to="/admin/projects/new"><q-item-section avatar><q-icon name="cloud_upload" /></q-item-section><q-item-section>{{ t('nav.host') }}</q-item-section></q-item><q-item clickable v-close-popup to="/api"><q-item-section avatar><q-icon name="code" /></q-item-section><q-item-section>{{ t('nav.api') }}</q-item-section></q-item><q-separator /><q-item v-if="!auth.account" clickable v-close-popup to="/auth"><q-item-section avatar><q-icon name="login" /></q-item-section><q-item-section>{{ t('nav.signIn') }}</q-item-section></q-item><q-item clickable v-close-popup @click="toggleLocale"><q-item-section avatar><q-icon name="translate" /></q-item-section><q-item-section>{{ languageLabel }}</q-item-section></q-item><q-item clickable v-close-popup @click="cycleTheme"><q-item-section :avatar="true"><q-icon :name="isDark ? 'dark_mode' : 'light_mode'" /></q-item-section><q-item-section>{{ themeLabel }}</q-item-section></q-item></q-list></q-menu></q-btn>
      </q-toolbar>
    </q-header>
    <q-page-container><router-view v-slot="{ Component }"><transition name="page" mode="out-in"><component :is="Component" /></transition></router-view></q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { applySiteAppearance, loadSiteAppearance, siteIconUrl, siteName } from './lib/site-settings'
import { useI18n, type Locale } from './i18n'
import { useTheme, type ThemeMode } from './theme'
import { listInvitations, listNotifications, markNotificationRead, respondInvitation, type Invitation, type Notification } from './lib/account'

const route = useRoute(); const auth = useAuthStore(); const { locale, languageLabel, t, setLocale, roleLabel } = useI18n(); const { mode: themeMode, isDark, setThemeMode } = useTheme(); const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''; const notificationOpen = ref(false); const notificationsLoading = ref(false); const notifications = ref<Notification[]>([]); const invitations = ref<Invitation[]>([])
const localeOptions = computed<{ value: Locale; label: string }[]>(() => [{ value: 'zh-CN', label: t('locale.chinese') }, { value: 'en-US', label: t('locale.english') }])
const themeOptions = computed<{ value: ThemeMode; label: string; icon: string }[]>(() => [{ value: 'system', label: t('theme.system'), icon: 'settings_brightness' }, { value: 'light', label: t('theme.light'), icon: 'light_mode' }, { value: 'dark', label: t('theme.dark'), icon: 'dark_mode' }])
const themeLabel = computed(() => themeOptions.value.find((item) => item.value === themeMode.value)?.label ?? t('theme.system'))
const accountLabel = computed(() => auth.account?.email?.split('@')[0] ?? t('nav.account'))
const toggleLocale = () => setLocale(locale.value === 'zh-CN' ? 'en-US' : 'zh-CN')
const cycleTheme = () => { const current = themeMode.value; setThemeMode(current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system') }
const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length + invitations.value.length)
const loadNotifications = async () => { if (!auth.account) return; notificationsLoading.value = true; try { const [notificationResult, invitationResult] = await Promise.all([listNotifications(), listInvitations()]); notifications.value = notificationResult.notifications; invitations.value = invitationResult.invitations } catch { /* notification loading is best effort */ } finally { notificationsLoading.value = false } }
const readNotification = async (id: string) => { const item = notifications.value.find((candidate) => candidate.id === id); if (!item || item.readAt) return; try { await markNotificationRead(id); item.readAt = new Date().toISOString() } catch { /* best effort */ } }
const respondToInvitation = async (id: string, status: 'accepted' | 'declined') => { try { await respondInvitation(id, status); invitations.value = invitations.value.filter((item) => item.id !== id); await loadNotifications() } catch { /* best effort */ } }
const formatNotificationDate = (value: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
onMounted(() => { applySiteAppearance(); void loadSiteAppearance() })
onMounted(async () => { await auth.load(); await loadNotifications() })
</script>
