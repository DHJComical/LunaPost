<template>
  <q-page class="page-shell api-docs-page q-py-xl">
    <div class="api-docs-hero"><div><div class="text-overline text-secondary">{{ t('apiDocs.eyebrow', { site: siteName }) }}</div><h1 class="text-h3 text-weight-bold q-my-sm">{{ t('apiDocs.title') }}</h1><p>{{ t('apiDocs.subtitle', { site: siteName }) }}</p></div><q-btn unelevated color="primary" icon="key" :label="t('apiDocs.manageKey')" to="/account" /></div>
    <div class="api-docs-layout">
      <aside class="api-docs-nav"><div class="text-overline text-grey-6 q-mb-sm">{{ t('apiDocs.contents') }}</div><a href="#quickstart">{{ t('apiDocs.quickStart') }}</a><a href="#projects">{{ t('apiDocs.projects') }}</a><a href="#downloads">{{ t('apiDocs.stableDownloads') }}</a><a href="#compatibility">{{ t('apiDocs.compatibility') }}</a><a href="#errors">{{ t('apiDocs.errors') }}</a></aside>
      <main class="api-docs-content">
        <section id="quickstart" class="api-docs-section"><h2>{{ t('apiDocs.quickStart') }}</h2><p>{{ t('apiDocs.publicRead') }}</p><pre class="api-code"><code>curl -H "Authorization: Bearer amp_live_xxx" \
  https://your-domain.example/api/v1/projects/example-mod</code></pre><div class="api-note"><q-icon name="info" /> {{ t('apiDocs.keyHint') }}</div></section>
        <section id="projects" class="api-docs-section"><h2>{{ t('apiDocs.projects') }}</h2><div class="api-endpoint"><div><q-badge color="positive" label="GET" /><code>/api/v1/projects</code></div><p>{{ t('apiDocs.searchProjects') }}</p><pre class="api-code"><code>curl "https://your-domain.example/api/v1/projects?query=font&amp;type=mod&amp;limit=20"</code></pre></div><div class="api-endpoint"><div><q-badge color="positive" label="GET" /><code>/api/v1/projects/:slug</code></div><p>{{ t('apiDocs.readProject') }}</p></div><div class="api-endpoint"><div><q-badge color="positive" label="GET" /><code>/api/v1/users/:id</code></div><p>{{ t('apiDocs.readUser') }}</p></div></section>
        <section id="downloads" class="api-docs-section"><h2>{{ t('apiDocs.stableDownloads') }}</h2><p>{{ t('apiDocs.downloadRecommendation') }}</p><div class="api-endpoint"><div><q-badge color="primary" label="GET" /><code>/api/v1/files/:fileId/download</code></div><p>{{ t('apiDocs.downloadFile') }}</p><pre class="api-code"><code>https://your-domain.example/api/v1/files/example-mod-1.0.0-jar/download
https://your-domain.example/api/v1/files/example-mod-1.0.0-jar/download?source=github</code></pre></div><div class="api-endpoint"><div><q-badge color="primary" label="GET" /><code>/api/v1/projects/:slug/site</code></div><p>{{ t('apiDocs.projectSite') }}</p></div></section>
        <section id="compatibility" class="api-docs-section"><h2>{{ t('apiDocs.compatibility') }}</h2><p>{{ t('apiDocs.compatibilityIntro') }}</p><pre class="api-code"><code>GET /v2/search
GET /v2/project/:id
GET /v2/project/:id/version
GET /v2/version/:version_id
GET /v2/version/:version_id/file/:file_name</code></pre><q-btn outline color="primary" :label="t('apiDocs.compatibilityRoot')" href="/v2" target="_blank" /></section>
        <section id="errors" class="api-docs-section"><h2>{{ t('apiDocs.errors') }}</h2><p>{{ t('apiDocs.errorResponse') }}</p><pre class="api-code"><code>{
  "error": {
    "code": "NOT_FOUND",
    "message": "{{ t('apiDocs.sampleNotFound') }}"
  }
}</code></pre></section>
      </main>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { siteName } from '../lib/site-settings'
import { useI18n } from '../i18n'

const { t } = useI18n()
</script>
