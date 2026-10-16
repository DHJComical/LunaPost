import { getAccessToken } from './auth'
import type { AccountMetadata, AccountView, Organization } from '@andrea/contracts'
import { useI18n } from '../i18n'

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const { t, locale } = useI18n()

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}), ...(options?.headers ?? {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error?.message ?? t('common.requestFailed'))
  return body as T
}

export type ApiKeySummary = { id: string; name: string; scopes: string[]; createdAt: string; revokedAt: string | null }
export const listApiKeys = () => request<{ apiKeys: ApiKeySummary[] }>('/api/v1/account/api-keys')
export const createApiKey = (name: string) => request<{ apiKey: ApiKeySummary; token: string }>('/api/v1/account/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes: ['read'] }) })
export const revokeApiKey = (id: string) => request<{ ok: boolean }>(`/api/v1/account/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
export type Invitation = { id: string; projectId: string; projectSlug: string; inviterId: string; email: string; role: string; status: string; createdAt: string }
export type Notification = { id: string; type: string; title: string; body: string; data: Record<string, unknown>; readAt: string | null; createdAt: string }
export const listInvitations = () => request<{ invitations: Invitation[] }>('/api/v1/account/invitations')
export const respondInvitation = (id: string, status: 'accepted' | 'declined') => request<{ ok: boolean }>(`/api/v1/account/invitations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const listNotifications = () => request<{ notifications: Notification[] }>('/api/v1/account/notifications')
export const markNotificationRead = (id: string) => request<{ ok: boolean }>(`/api/v1/account/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
export const updateProfile = (metadata: AccountMetadata) => request<{ account: AccountView }>('/api/v1/account/profile', { method: 'PATCH', body: JSON.stringify({ metadata }) })
export const updateMinecraftProfile = (profile: { skinUrl?: string | null; capeUrl?: string | null }) => request<{ account: AccountView }>('/api/v1/account/minecraft-profile', { method: 'PATCH', body: JSON.stringify(profile) })
export const startMojangDeviceCode = () => request<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval?: number }>('/api/v1/account/mojang/device-code')
export const pollMojangDeviceCode = (deviceCode: string) => request<{ ok: boolean; account: { minecraftUuid: string; skinUrl: string | null; capeUrl: string | null; uuidSource: string; name: string } }>('/api/v1/account/mojang/poll', { method: 'POST', body: JSON.stringify({ deviceCode }) })
export const uploadSkinAsset = async (file: File) => { const form = new FormData(); form.append('file', file); form.append('purpose', 'skin'); const response = await fetch(`${baseUrl}/api/v1/account/uploads`, { method: 'POST', body: form, credentials: 'include', headers: { 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error?.message ?? t('account.skinUploadFailed')); return body as { url: string } }
export type UserSearchResult = { id: string; email: string; displayName: string; role: 'developer' | 'admin' | 'root' }
export const searchUsers = (query: string, projectSlug?: string) => request<{ users: UserSearchResult[] }>(`/api/v1/users?query=${encodeURIComponent(query)}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ''}`)
export const listOrganizations = () => request<{ organizations: Organization[] }>('/api/v1/organizations')
export const createOrganization = (input: Pick<Organization, 'slug' | 'name'> & Partial<Pick<Organization, 'description' | 'avatarUrl'>>) => request<{ organization: Organization }>('/api/v1/organizations', { method: 'POST', body: JSON.stringify(input) })
export type OrganizationMember = { organizationId: string; accountId: string; email: string; role: string }
export const getOrganization = (slug: string) => request<{ organization: Organization; members: OrganizationMember[]; projects: import('@andrea/contracts').Project[] }>(`/api/v1/organizations/${encodeURIComponent(slug)}`)
export const listFavorites = () => request<{ favorites: Array<{ accountId: string; projectSlug: string; createdAt: string }>; projects: import('@andrea/contracts').Project[] }>('/api/v1/account/favorites')
export const getProjectFavorite = (slug: string) => request<{ favorite: boolean; count: number }>(`/api/v1/projects/${encodeURIComponent(slug)}/favorite`)
export const setProjectFavorite = (slug: string, favorite: boolean) => request<{ favorite: boolean; count: number }>(`/api/v1/projects/${encodeURIComponent(slug)}/favorite`, { method: favorite ? 'PUT' : 'DELETE' })
