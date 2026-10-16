import type { SiteSettings } from '@andrea/contracts'
import { getAccessToken } from './auth'
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
export type AdminOverview = { accounts: number; projects: number; versions: number; files: number; downloads: number; favorites: number; topDownloads: Array<{ projectSlug: string; count: number }>; topFavorites: Array<{ projectSlug: string; count: number }> }
export const adminOverview = () => request<AdminOverview>('/api/v1/admin/overview')
export const adminAccounts = () => request<{ accounts: any[] }>('/api/v1/admin/accounts')
export const adminProjects = () => request<{ projects: any[] }>('/api/v1/admin/projects')
export const createProject = (project: unknown) => request<{ project: any }>('/api/v1/admin/projects', { method: 'POST', body: JSON.stringify(project) })
export const updateProject = (slug: string, project: unknown) => request<{ project: any }>(`/api/v1/admin/projects/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(project) })
export const deleteProject = (slug: string) => request<{ ok: boolean }>(`/api/v1/admin/projects/${encodeURIComponent(slug)}`, { method: 'DELETE' })
export type ProjectMember = { projectId: string; accountId: string; email: string; role: string }
export const listProjectMembers = (slug: string) => request<{ members: ProjectMember[] }>(`/api/v1/projects/${encodeURIComponent(slug)}/members`)
export const inviteProjectMember = (slug: string, email: string, role: string) => request<{ invitation: unknown }>(`/api/v1/projects/${encodeURIComponent(slug)}/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) })
export const removeProjectMember = (slug: string, accountId: string) => request<{ ok: boolean }>(`/api/v1/projects/${encodeURIComponent(slug)}/members/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
export const updateAccountRole = (id: string, role: 'user' | 'developer' | 'admin' | 'root') => request<{ ok: boolean }>(`/api/v1/admin/accounts/${encodeURIComponent(id)}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
export const updateAccountVerification = (id: string, approved: boolean) => request<{ ok: boolean; verifiedAt: string | null }>(`/api/v1/admin/accounts/${encodeURIComponent(id)}/verification`, { method: 'PATCH', body: JSON.stringify({ approved }) })
export const updateMinecraftProfile = (id: string, profile: { uuid: string; skinUrl?: string | null; capeUrl?: string | null; source?: 'local' | 'mojang' | 'upstream' }) => request<{ ok: boolean; minecraftUuid: string }>(`/api/v1/admin/accounts/${encodeURIComponent(id)}/minecraft-profile`, { method: 'PATCH', body: JSON.stringify(profile) })
export const deleteAccount = (id: string) => request<{ ok: boolean }>(`/api/v1/admin/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const adminSettings = () => request<{ settings: SiteSettings }>('/api/v1/admin/settings')
export const updateAdminSettings = (settings: SiteSettings) => request<{ settings: SiteSettings }>('/api/v1/admin/settings', { method: 'PUT', body: JSON.stringify(settings) })
export type ReviewItem = { type: 'project' | 'file'; id: string; slug: string; title: string; status: string; ownerId?: string }
export const adminReviews = () => request<{ reviews: ReviewItem[] }>('/api/v1/admin/reviews')
export const reviewProject = (slug: string, decision: 'approve' | 'reject', note?: string) => request<{ ok: boolean }>(`/api/v1/admin/reviews/projects/${encodeURIComponent(slug)}`, { method: 'POST', body: JSON.stringify({ decision, note }) })
export const reviewFile = (id: string, decision: 'approve' | 'reject', note?: string) => request<{ ok: boolean }>(`/api/v1/admin/reviews/files/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ decision, note }) })
