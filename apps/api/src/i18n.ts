import enUS from './locales/en-US.js'
import zhCN from './locales/zh-CN.js'

const messages = { 'zh-CN': zhCN, 'en-US': enUS } as const
type ApiLocale = keyof typeof messages

export const translateApiText = (acceptLanguage: string | undefined, key: string, params: Record<string, string | number> = {}) => {
  const locale: ApiLocale = acceptLanguage?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  let value = messages[locale][key as keyof typeof zhCN] ?? messages['zh-CN'][key as keyof typeof zhCN] ?? key
  for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}
