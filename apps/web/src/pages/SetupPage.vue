<template>
  <q-page class="page-shell q-py-xl">
    <div class="auth-card q-mx-auto">
      <div class="text-overline text-primary">{{ t('setup.eyebrow') }}</div>
      <h1 class="text-h4 text-weight-bold q-mt-sm">{{ t('setup.title') }}</h1>
      <p class="text-grey-7">{{ t('setup.subtitle') }}</p>

      <q-banner v-if="status?.initialized" rounded class="bg-green-1 text-green-9 q-mb-md">
        {{ t('setup.initialized') }}
        <template #action><q-btn flat :label="t('nav.signIn')" to="/auth" /></template>
      </q-banner>
      <q-banner v-else-if="error" rounded class="bg-red-1 text-red-9 q-mb-md">{{ error }}</q-banner>
      <q-form v-else class="q-gutter-md" @submit.prevent="submit">
        <q-input v-model="formSiteName" outlined :label="t('setup.siteName')" required />
        <q-input v-if="status?.requiresToken" v-model="token" outlined :label="t('setup.token')" type="password" required />
        <q-input v-model="email" outlined type="email" :label="t('setup.adminEmail')" autocomplete="email" required />
        <q-input v-model="password" outlined type="password" :label="t('setup.adminPassword')" autocomplete="new-password" minlength="8" required />
        <q-btn type="submit" color="primary" unelevated class="full-width" :label="t('setup.submit')" :loading="loading" />
      </q-form>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getSetupStatus, initialize, type SetupStatus } from '../lib/setup'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../i18n'

const { t } = useI18n()
const status = ref<SetupStatus>()
const auth = useAuthStore()
const formSiteName = ref('')
const token = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const load = async () => {
  try {
    status.value = await getSetupStatus()
  } catch {
    error.value = t('setup.apiUnavailable')
  }
}

const submit = async () => {
  loading.value = true
  error.value = ''
  try {
    const result = await initialize({ siteName: formSiteName.value, token: token.value || undefined, email: email.value, password: password.value })
    auth.setAccount(result.account)
    status.value = { initialized: true, requiresToken: false }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('setup.failed')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
