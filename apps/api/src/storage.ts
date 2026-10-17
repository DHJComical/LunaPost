export type StoredObject = { body: ArrayBuffer | Uint8Array; contentType: string; filename?: string }
export type MultipartPart = { partNumber: number; etag: string }
export type StorageSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'
export type StorageSyncResult = { providerId: string; status: StorageSyncStatus; error?: string; syncedAt?: string }
export interface StorageAdapter {
  put(id: string, body: ArrayBuffer, contentType: string, filename?: string): Promise<void>
  get(id: string): Promise<StoredObject | null>
  head?(id: string): Promise<boolean>
  getRedirectUrl?(id: string, expiresInSeconds?: number): Promise<string>
  createUploadUrl?(id: string, contentType?: string, filename?: string, expiresInSeconds?: number): Promise<string>
  createMultipart?(id: string, contentType: string, filename?: string): Promise<string>
  uploadPart?(id: string, uploadId: string, partNumber: number, body: ArrayBuffer): Promise<string>
  completeMultipart?(id: string, uploadId: string, parts: MultipartPart[]): Promise<void>
}

export type StorageProviderConfig = {
  id?: string
  name?: string
  provider: 'r2' | 'tencent_cos'
  enabled?: boolean
  primary?: boolean
  priority?: number
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  pathPrefix: string
}

/**
 * Presents one primary object store and any number of mirrors as one store.
 * Reads prefer the primary and fall back to mirrors; writes always complete on
 * the primary first and then mirror in the configured order.
 */
export class StoragePool implements StorageAdapter {
  readonly providers: Array<{ id: string; config: StorageProviderConfig; adapter: StorageAdapter; primary: boolean }>
  readonly primary: StorageAdapter
  readonly primaryId: string
  constructor(
    providers: Array<{ id: string; config: StorageProviderConfig; adapter: StorageAdapter; primary?: boolean }>,
    private readonly mode: 'manual' | 'automatic' = 'manual',
    private readonly schedule?: (task: Promise<void>) => void,
  ) {
    this.providers = providers.filter((item) => item.config.enabled !== false).map((item) => ({ ...item, primary: Boolean(item.primary) }))
    const primary = this.providers.find((item) => item.primary) ?? this.providers[0]
    if (!primary) throw new Error('No enabled storage provider is configured')
    this.primary = primary.adapter
    this.primaryId = primary.id
    this.providers = this.providers.map((item) => ({ ...item, primary: item.id === primary.id }))
  }
  private mirrors() { return this.providers.filter((item) => !item.primary) }
  private async mirrorPut(id: string, body: ArrayBuffer, contentType: string, filename?: string) {
    await Promise.all(this.mirrors().map(async (item) => {
      try { await item.adapter.put(id, body, contentType, filename) } catch (error) { throw new Error(`${item.id}: ${error instanceof Error ? error.message : String(error)}`) }
    }))
  }
  async put(id: string, body: ArrayBuffer, contentType: string, filename?: string) {
    await this.primary.put(id, body, contentType, filename)
    if (this.mode === 'automatic' && this.mirrors().length) {
      const task = this.mirrorPut(id, body, contentType, filename)
      if (this.schedule) this.schedule(task.catch(() => undefined)); else await task
    }
  }
  async get(id: string) {
    for (const item of this.providers) {
      try { const object = await item.adapter.get(id); if (object) return object } catch { /* try the next mirror */ }
    }
    return null
  }
  async head(id: string) {
    if (!this.primary.head) return false
    return this.primary.head(id)
  }
  async getRedirectUrl(id: string, expiresInSeconds?: number) {
    for (const item of this.providers) {
      if (!item.adapter.getRedirectUrl) continue
      try {
        if (item.adapter.head && !await item.adapter.head(id)) continue
        return await item.adapter.getRedirectUrl(id, expiresInSeconds)
      } catch { /* try the next mirror */ }
    }
    throw new Error('No storage provider can create a download URL')
  }
  async createUploadUrl(id: string, contentType?: string, filename?: string, expiresInSeconds?: number) {
    if (!this.primary.createUploadUrl) throw new Error('Primary storage does not support direct uploads')
    return this.primary.createUploadUrl(id, contentType, filename, expiresInSeconds)
  }
  async createMultipart(id: string, contentType: string, filename?: string) {
    if (!this.primary.createMultipart) throw new Error('Primary storage does not support multipart uploads')
    return this.primary.createMultipart(id, contentType, filename)
  }
  async uploadPart(id: string, uploadId: string, partNumber: number, body: ArrayBuffer) {
    if (!this.primary.uploadPart) throw new Error('Primary storage does not support multipart uploads')
    return this.primary.uploadPart(id, uploadId, partNumber, body)
  }
  async completeMultipart(id: string, uploadId: string, parts: MultipartPart[]) {
    if (!this.primary.completeMultipart) throw new Error('Primary storage does not support multipart uploads')
    await this.primary.completeMultipart(id, uploadId, parts)
    if (this.mode === 'automatic' && this.mirrors().length) {
      const task = this.sync(id).then(() => undefined)
      if (this.schedule) this.schedule(task.catch(() => undefined)); else await task
    }
  }
  /** Copy an existing primary object to every enabled mirror. */
  async sync(id: string, selectedProviderIds?: string[]): Promise<StorageSyncResult[]> {
    const source = await this.primary.get(id)
    if (!source) return this.mirrors().map((item) => ({ providerId: item.id, status: 'failed', error: 'Object not found in primary storage' }))
    const selected = selectedProviderIds?.length ? new Set(selectedProviderIds) : null
    return Promise.all(this.mirrors().filter((item) => !selected || selected.has(item.id)).map(async (item) => {
      try { await item.adapter.put(id, source.body instanceof ArrayBuffer ? source.body : source.body.slice().buffer, source.contentType, source.filename); return { providerId: item.id, status: 'synced', syncedAt: new Date().toISOString() } }
      catch (error) { return { providerId: item.id, status: 'failed', error: error instanceof Error ? error.message : String(error) } }
    }))
  }
}

export class R2Storage implements StorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}
  async put(id: string, body: ArrayBuffer, contentType: string, filename?: string) { await this.bucket.put(id, body, { httpMetadata: { contentType, contentDisposition: filename ? `attachment; filename="${filename.replaceAll('"', '')}"` : undefined } }) }
  async get(id: string) {
    const object = await this.bucket.get(id)
    if (!object) return null
    return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? 'application/octet-stream', filename: undefined }
  }
  async head(id: string) { return Boolean(await this.bucket.head(id)) }
  async createMultipart(id: string, contentType: string, filename?: string) {
    const upload = await this.bucket.createMultipartUpload(id, { httpMetadata: { contentType, contentDisposition: filename ? `attachment; filename="${filename.replaceAll('"', '')}"` : undefined } })
    return upload.uploadId
  }
  async uploadPart(_id: string, uploadId: string, partNumber: number, body: ArrayBuffer) {
    const upload = this.bucket.resumeMultipartUpload(_id, uploadId)
    return (await upload.uploadPart(partNumber, body)).etag
  }
  async completeMultipart(id: string, uploadId: string, parts: MultipartPart[]) {
    await this.bucket.resumeMultipartUpload(id, uploadId).complete(parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })))
  }
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('')
const sha1 = async (value: string) => hex(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value)))
const cosEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
const hmacSha1 = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

/** Tencent COS XML API adapter. Credentials are only used server-side. */
export class TencentCosStorage implements StorageAdapter {
  private readonly host: string
  private readonly baseUrl: string
  private readonly prefix: string
  constructor(private readonly config: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; pathPrefix?: string }) {
    this.host = new URL(config.endpoint || `https://${config.bucket}.cos.${config.region}.myqcloud.com`).host
    this.baseUrl = `https://${this.host}`
    this.prefix = (config.pathPrefix || '').replace(/^\/+|\/+$/gu, '')
  }
  private key(id: string) { return [this.prefix, id.replace(/^\/+/, '')].filter(Boolean).join('/') }
  private uri(key: string) { return `/${key.split('/').map((part) => cosEncode(part)).join('/')}` }
  async getRedirectUrl(id: string, expiresInSeconds = 300) {
    const now = Math.floor(Date.now() / 1000); const start = now - 60; const end = now + Math.max(60, Math.min(900, expiresInSeconds)); const keyTime = `${start};${end}`
    const uri = this.uri(this.key(id)); const httpString = `get\n/${this.key(id)}\n\nhost=${cosEncode(this.host)}\n`; const signKey = await hmacSha1(this.config.secretAccessKey, keyTime); const stringToSign = `sha1\n${keyTime}\n${await sha1(httpString)}\n`; const signature = await hmacSha1(signKey, stringToSign)
    const url = new URL(`${this.baseUrl}${uri}`)
    url.searchParams.set('q-sign-algorithm', 'sha1'); url.searchParams.set('q-ak', this.config.accessKeyId); url.searchParams.set('q-sign-time', keyTime); url.searchParams.set('q-key-time', keyTime); url.searchParams.set('q-header-list', 'host'); url.searchParams.set('q-url-param-list', ''); url.searchParams.set('q-signature', signature)
    return url.href
  }
  async createUploadUrl(id: string, _contentType = 'application/octet-stream', _filename?: string, expiresInSeconds = 300) {
    const now = Math.floor(Date.now() / 1000); const start = now - 60; const end = now + Math.max(60, Math.min(900, expiresInSeconds)); const keyTime = `${start};${end}`
    const uri = this.uri(this.key(id)); const httpString = `put\n/${this.key(id)}\n\nhost=${cosEncode(this.host)}\n`; const signKey = await hmacSha1(this.config.secretAccessKey, keyTime); const stringToSign = `sha1\n${keyTime}\n${await sha1(httpString)}\n`; const signature = await hmacSha1(signKey, stringToSign)
    const url = new URL(`${this.baseUrl}${uri}`)
    url.searchParams.set('q-sign-algorithm', 'sha1'); url.searchParams.set('q-ak', this.config.accessKeyId); url.searchParams.set('q-sign-time', keyTime); url.searchParams.set('q-key-time', keyTime); url.searchParams.set('q-header-list', 'host'); url.searchParams.set('q-url-param-list', ''); url.searchParams.set('q-signature', signature)
    return url.href
  }
  private async request(method: string, key: string, body?: ArrayBuffer | string, query: Record<string, string> = {}, contentType?: string) {
    const now = Math.floor(Date.now() / 1000); const start = now - 60; const end = now + 900; const keyTime = `${start};${end}`
    const uri = this.uri(key); const params = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)); const paramText = params.map(([name, value]) => `${cosEncode(name.toLowerCase())}=${cosEncode(value)}`).join('&')
    const headers = [['host', this.host], ...(contentType ? [['content-type', contentType] as [string, string]] : [])].sort(([a], [b]) => a.localeCompare(b)); const headerText = headers.map(([name, value]) => `${name}=${cosEncode(value)}`).join('&'); const headerList = headers.map(([name]) => name).join(';')
    const httpString = `${method.toLowerCase()}\n/${key}\n${paramText}\n${headerText}\n`; const signKey = await hmacSha1(this.config.secretAccessKey, keyTime); const stringToSign = `sha1\n${keyTime}\n${await sha1(httpString)}\n`; const signature = await hmacSha1(signKey, stringToSign)
    const authorization = `q-sign-algorithm=sha1&q-ak=${this.config.accessKeyId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=${headerList}&q-url-param-list=${params.map(([name]) => name.toLowerCase()).join(';')}&q-signature=${signature}`
    const url = new URL(`${this.baseUrl}${uri}`); for (const [name, value] of params) url.searchParams.set(name, value)
    const response = await fetch(url, {
      method,
      body: body === undefined ? undefined : typeof body === 'string' ? body : new Uint8Array(body),
      headers: { Host: this.host, Authorization: authorization, ...(contentType ? { 'Content-Type': contentType } : {}) },
    })
    return response
  }
  async put(id: string, body: ArrayBuffer, contentType: string, filename?: string) {
    const response = await this.request('PUT', this.key(id), body, {}, contentType); if (!response.ok) throw new Error(`Tencent COS upload failed: ${response.status}`)
  }
  async get(id: string) {
    const response = await this.request('GET', this.key(id)); if (response.status === 404) return null; if (!response.ok) throw new Error(`Tencent COS download failed: ${response.status}`)
    return { body: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'application/octet-stream', filename: undefined }
  }
  async head(id: string) {
    const response = await this.request('HEAD', this.key(id))
    if (response.status === 404) return false
    if (!response.ok) throw new Error(`Tencent COS head failed: ${response.status}`)
    return true
  }
  async createMultipart(id: string, contentType: string) {
    const response = await this.request('POST', this.key(id), '', { uploads: '' }, contentType); if (!response.ok) throw new Error(`Tencent COS multipart initialization failed: ${response.status}`)
    const xml = await response.text(); const uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/u)?.[1]; if (!uploadId) throw new Error('Tencent COS did not return an upload ID'); return uploadId
  }
  async uploadPart(id: string, uploadId: string, partNumber: number, body: ArrayBuffer) {
    const response = await this.request('PUT', this.key(id), body, { partNumber: String(partNumber), uploadId }); if (!response.ok) throw new Error(`Tencent COS part upload failed: ${response.status}`); return response.headers.get('etag')?.replaceAll('"', '') || ''
  }
  async completeMultipart(id: string, uploadId: string, parts: MultipartPart[]) {
    const xml = `<CompleteMultipartUpload>${parts.sort((a, b) => a.partNumber - b.partNumber).map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>&quot;${part.etag.replaceAll('"', '')}&quot;</ETag></Part>`).join('')}</CompleteMultipartUpload>`
    const response = await this.request('POST', this.key(id), xml, { uploadId }, 'application/xml'); if (!response.ok) throw new Error(`Tencent COS multipart completion failed: ${response.status}`)
  }
}
