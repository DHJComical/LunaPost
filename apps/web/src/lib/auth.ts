import type { AccountView } from '@andrea/contracts'
import { useI18n } from '../i18n'

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const { t, locale } = useI18n()
let accessToken: string | null = null

export const setAccessToken = (token: string | null) => { accessToken = token }
export const getAccessToken = () => accessToken

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': locale.value, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(options?.headers ?? {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error?.message ?? t('common.requestFailedStatus', { status: response.status }))
  return body as T
}

export const register = async (email: string, password: string, inviteCode?: string) => {
  const result = await request<{ account: AccountView; accessToken?: string; pendingApproval?: boolean }>('/api/v1/auth/register', {
  method: 'POST',
    body: JSON.stringify({ email, password, ...(inviteCode?.trim() ? { inviteCode: inviteCode.trim() } : {}) }),
  })
  if (result.accessToken) setAccessToken(result.accessToken)
  return result
}

export const login = async (email: string, password: string) => {
  const result = await request<{ account: AccountView; accessToken?: string }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (result.accessToken) setAccessToken(result.accessToken)
  return result
}

export const getMe = () => request<{ account: AccountView | null }>('/api/v1/me')
export const getPublicRegistrationSettings = () => request<{ settings: { registration: { enabled: boolean; requireInviteCode: boolean; requireApproval: boolean } } }>('/api/v1/settings')
export const logout = async () => {
  const result = await request<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' })
  setAccessToken(null)
  return result
}
