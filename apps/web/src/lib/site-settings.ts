import type { SiteSettings } from '@andrea/contracts'
import { ref } from 'vue'
import { useI18n } from '../i18n'

const { locale } = useI18n()

export const siteName = ref('LunaPost')
export const siteIconUrl = ref('/assets/projects/luna-launcher/icon.png')

export const applySiteAppearance = (appearance?: SiteSettings['appearance']) => {
  document.documentElement.dataset.roundedProjectIcons = String(appearance?.roundedProjectIcons !== false)
  siteName.value = appearance?.siteName?.trim() || 'LunaPost'
  siteIconUrl.value = appearance?.siteIconUrl?.trim() || '/assets/projects/luna-launcher/icon.png'
  document.title = siteName.value
  let favicon = document.querySelector<HTMLLinkElement>('link[data-site-favicon]')
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    favicon.dataset.siteFavicon = 'true'
    document.head.appendChild(favicon)
  }
  favicon.href = siteIconUrl.value
}

export const loadSiteAppearance = async () => {
  // Static exports have no settings service and use the default rounded icons.
  if (import.meta.env.VITE_STATIC_MODE === 'true') return
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  try {
    const response = await fetch(`${baseUrl}/api/v1/settings`, { headers: { 'Accept-Language': locale.value } })
    if (!response.ok) return
    const body = await response.json() as { settings?: Pick<SiteSettings, 'appearance'> }
    applySiteAppearance(body.settings?.appearance)
  } catch { /* Keep the default appearance when the settings service is unavailable. */ }
}
