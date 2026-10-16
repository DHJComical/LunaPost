import { computed, ref } from 'vue'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'

const messages: Record<Locale, Record<string, string>> = { 'zh-CN': zhCN, 'en-US': enUS }

const initialLocale = typeof window !== 'undefined' && window.localStorage.getItem('andrea-locale') === 'en-US' ? 'en-US' : 'zh-CN'
const locale = ref<Locale>(initialLocale)

export const useI18n = () => {
  const currentLocale = computed(() => locale.value)
  const languageLabel = computed(() => messages[locale.value]['locale.self'])
  const t = (key: string, params: Record<string, string | number> = {}) => {
    let value = messages[locale.value][key] ?? messages['zh-CN'][key] ?? key
    for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement))
    return value
  }
  const projectTypeLabel = (type: string) => { const key = `projectType.${type}`; return messages[locale.value][key] ? t(key) : type }
  const statusLabel = (status: string) => { const key = `status.${status}`; return messages[locale.value][key] ? t(key) : status }
  const versionTypeLabel = (type: string) => { const key = `project.versionType.${type}`; return messages[locale.value][key] ? t(key) : type }
  const roleLabel = (role: string) => {
    const keys: Record<string, string> = { owner: 'project.role.owner', admin: 'project.role.admin', editor: 'project.role.editor', reviewer: 'project.role.reviewer', member: 'project.role.member', user: 'account.role.user', developer: 'account.role.developer', root: 'account.role.root' }
    const key = keys[role]
    return key ? t(key) : role
  }
  const setLocale = (next: Locale) => { locale.value = next; if (typeof window !== 'undefined') { window.localStorage.setItem('andrea-locale', next); document.documentElement.lang = next } }
  const reviewTypeLabel = (type: string) => type === 'project' ? t('admin.reviewTypeProject') : type === 'file' ? t('admin.reviewTypeFile') : type
  return { locale: currentLocale, languageLabel, t, setLocale, projectTypeLabel, statusLabel, versionTypeLabel, roleLabel, reviewTypeLabel, supportedLocales: ['zh-CN', 'en-US'] as Locale[] }
}

if (typeof document !== 'undefined') document.documentElement.lang = locale.value
