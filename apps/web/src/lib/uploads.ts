import { getAccessToken } from './auth'
import { useI18n } from '../i18n'

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
const { locale } = useI18n()

export type UploadProgressHandler = (percent: number) => void

type UploadOptions = {
  fields?: Record<string, string>
  onProgress?: UploadProgressHandler
  errorMessage: string
  direct?: { purpose: 'account' | 'project-file'; projectSlug?: string }
}

type ErrorBody = { error?: { message?: unknown } }

class DirectUploadUnavailable extends Error {}

const readBody = async (response: Response): Promise<ErrorBody & Record<string, unknown>> => await response.json().catch(() => ({})) as ErrorBody & Record<string, unknown>

const putDirect = (url: string, file: File, contentType: string, onProgress: UploadProgressHandler | undefined, errorMessage: string) => new Promise<void>((resolve, reject) => {
  const xhr = new XMLHttpRequest()
  xhr.open('PUT', url)
  xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream')
  onProgress?.(0)
  xhr.upload.addEventListener('progress', (event) => { if (event.lengthComputable) onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100))) })
  xhr.onerror = () => reject(new Error(errorMessage))
  xhr.onabort = () => reject(new Error(errorMessage))
  xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve() } else reject(new Error(errorMessage)) }
  xhr.send(file)
})

const tryDirectUpload = async <T>(file: File, options: UploadOptions): Promise<T | null> => {
  if (!options.direct) return null
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1/storage/direct-uploads`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) }, body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream', purpose: options.direct.purpose, ...(options.direct.projectSlug ? { projectSlug: options.direct.projectSlug } : {}) }) })
  } catch { return null }
  const session = await readBody(response)
  if ([403, 404, 409].includes(response.status)) throw new DirectUploadUnavailable()
  if (!response.ok || typeof session.uploadUrl !== 'string' || typeof session.completeUrl !== 'string') throw new Error(typeof session.error?.message === 'string' ? session.error.message : options.errorMessage)
  await putDirect(session.uploadUrl, file, file.type || 'application/octet-stream', options.onProgress, options.errorMessage)
  const completeResponse = await fetch(session.completeUrl, { method: 'POST', credentials: 'include', headers: { 'Accept-Language': locale.value, ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) } })
  const result = await readBody(completeResponse)
  if (!completeResponse.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : options.errorMessage)
  return result as T
}

/** Upload multipart form data while exposing the browser's native upload progress events. */
export const uploadMultipart = async <T>(path: string, file: File, options: UploadOptions): Promise<T> => {
  if (options.direct) {
    try {
      const result = await tryDirectUpload<T>(file, options)
      if (result !== null) return result
    } catch (error) {
      if (!(error instanceof DirectUploadUnavailable)) throw error
    }
  }
  return new Promise<T>((resolve, reject) => {
  const xhr = new XMLHttpRequest()
  xhr.open('POST', `${baseUrl}${path}`)
  xhr.withCredentials = true
  xhr.setRequestHeader('Accept-Language', locale.value)
  const token = getAccessToken()
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

  options.onProgress?.(0)
  xhr.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
  })
  xhr.onerror = () => reject(new Error(options.errorMessage))
  xhr.onabort = () => reject(new Error(options.errorMessage))
  xhr.onload = () => {
    let body: T | ErrorBody = {} as T
    try { body = JSON.parse(xhr.responseText || '{}') as T | ErrorBody } catch { /* handled by the generic error below */ }
    if (xhr.status >= 200 && xhr.status < 300) {
      options.onProgress?.(100)
      resolve(body as T)
      return
    }
    const errorMessage = (body as ErrorBody).error?.message
    reject(new Error(typeof errorMessage === 'string' ? errorMessage : options.errorMessage))
  }

  const form = new FormData()
  for (const [name, value] of Object.entries(options.fields ?? {})) form.append(name, value)
  form.append('file', file)
  xhr.send(form)
  })
}
