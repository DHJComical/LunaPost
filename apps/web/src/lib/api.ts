import type { Project } from '@andrea/contracts'
import { useI18n } from '../i18n'

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const { locale, t } = useI18n()

const request = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'Accept-Language': locale.value } })
  if (!response.ok) throw new Error(t('common.requestFailedStatus', { status: response.status }))
  return response.json() as Promise<T>
}

export type ProjectListParams = { query?: string; type?: string; loader?: string | string[]; gameVersion?: string; category?: string | string[]; clientSide?: string; serverSide?: string; sort?: string; offset?: number; limit?: number }
export const listProjects = (params: ProjectListParams = {}) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries({ query: params.query, type: params.type, loader: params.loader, game_version: params.gameVersion, category: params.category, client_side: params.clientSide, server_side: params.serverSide, sort: params.sort, offset: params.offset, limit: params.limit })) {
    if (Array.isArray(value)) value.filter(Boolean).forEach((item) => search.append(key, item))
    else if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return request<{ projects: Project[]; total: number }>(`/api/v1/projects${suffix}`)
}
export const getProject = (slug: string) => {
  const suffix = import.meta.env.VITE_STATIC_MODE === 'true' ? '.json' : ''
  return request<Project>(`/api/v1/projects/${encodeURIComponent(slug)}${suffix}`)
}

export type PublicProfile = { id: string; handle: string; displayName: string; avatarUrl: string | null; bio: string; location?: string; websiteUrl?: string | null; githubUrl?: string | null; links?: Array<{ id?: string; label: string; url: string; icon?: string; group?: string }>; createdAt: string }
export const getUserProfile = (id: string) => request<{ profile: PublicProfile; projects: Project[] }>(`/api/v1/users/${encodeURIComponent(id)}`)
