import type { DependencyRequest, resolveDependencies } from '@andrea/contracts'
import { getAccessToken } from './auth'
import { useI18n } from '../i18n'
const { locale, t } = useI18n()
export type Resolution = ReturnType<typeof resolveDependencies>
export async function resolveRemote(input: DependencyRequest, project?: import('@andrea/contracts').Project): Promise<Resolution> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/dependencies/${project ? 'preview' : 'resolve'}`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) }, body: JSON.stringify(project ? { input, project } : input),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error?.message || t('dependency.resolveFailed'))
  return body
}

export async function lookupExternal(ref: import('@andrea/contracts').ExternalDependency, loader: string, gameVersion: string): Promise<{ reference: import('@andrea/contracts').ExternalDependency; title: string; versions: Array<{ id: string; version: string }> }> {
  const query = new URLSearchParams({ provider: ref.provider, projectId: ref.projectId, loader, gameVersion, ...(ref.versionId ? { versionId: ref.versionId } : {}) })
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/dependencies/external?${query}`, { credentials: 'include', headers: { 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) } })
  const data = await response.json()
  if (!response.ok) throw new Error(`${data.error?.code || 'EXTERNAL_ERROR'}: ${data.error?.message || t('dependency.lookupFailed')}`)
  return data
}
