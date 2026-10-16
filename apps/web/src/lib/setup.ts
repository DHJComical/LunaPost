import type { AccountView } from '@andrea/contracts'
import { setAccessToken } from './auth'
import { useI18n } from '../i18n'

export type SetupStatus = { initialized: boolean; requiresToken: boolean }

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const { t, locale } = useI18n()

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': locale.value, ...(options?.headers ?? {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error?.message ?? t('common.requestFailedStatus', { status: response.status }))
  return body as T
}

export const getSetupStatus = () => request<SetupStatus>('/api/v1/setup/status')
export const initialize = async (payload: { token?: string; siteName: string; email: string; password: string }) => {
  const result = await request<{ initialized: boolean; account: AccountView; accessToken?: string }>('/api/v1/setup/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (result.accessToken) setAccessToken(result.accessToken)
  return result
}
