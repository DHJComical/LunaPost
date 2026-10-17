import { externalProviderClient, ExternalProviderError, resolveWithExternal } from './external-dependencies.js'
import { externalDependencySchema, dependencyRequestSchema, resolveDependencies, validateDependencies } from '@andrea/contracts'
import { cors } from 'hono/cors'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono'
import { translateApiText as apiT } from './i18n.js'
import { accountMetadataSchema, catalogSchema, loginSchema, organizationSchema, projectSchema, registerSchema, setupInitializeSchema, versionSchema, type Catalog, type Organization, type Project, type Source, type SiteSettings, type ModerationPolicy } from '@andrea/contracts'
import { exampleCatalog } from '@andrea/contracts/catalog'
import { accountView, createJwt, D1AccountStore, hashApiKey, hashPassword, hashSessionId, MemoryAccountStore, type AccountRecord, type AccountRole, type AccountStore, type ProjectMemberRole, verifyJwt, verifyPassword } from './auth.js'
import { registerModrinthCompat } from './modrinth-compat.js'
import { registerDownloads } from './downloads.js'
import { R2Storage, StoragePool, TencentCosStorage, type StorageAdapter, type StorageProviderConfig, type StorageSyncResult } from './storage.js'
import { registerYgg } from './ygg.js'
import { registerMojang } from './mojang.js'

export type AppEnv = {
  Bindings: {
    CURSEFORGE_API_KEY?: string
    CATALOG_JSON?: string
    PUBLIC_BASE_URL?: string
    DB?: D1Database
    CORS_ORIGINS?: string
    SETUP_TOKEN?: string
    JWT_SECRET?: string
    MODERATION_API_TOKEN?: string
    YGG_TEXTURE_PRIVATE_KEY?: string
    YGG_TEXTURE_PUBLIC_KEY?: string
    STORAGE?: R2Bucket
  }
}

const regionForCountry = (country?: string) => {
  if (!country) return 'GLOBAL'
  if (country.toUpperCase() === 'CN') return 'CN'
  if (['JP', 'KR', 'SG', 'TW', 'HK'].includes(country.toUpperCase())) return 'APAC'
  if (['US', 'CA', 'MX'].includes(country.toUpperCase())) return 'NA'
  if (['GB', 'DE', 'FR', 'NL', 'SE', 'FI', 'NO', 'ES', 'IT'].includes(country.toUpperCase())) return 'EU'
  return 'GLOBAL'
}

const localizedExampleCatalog = (acceptLanguage?: string): Catalog => ({
  ...exampleCatalog,
  projects: exampleCatalog.projects.map((project) => ({
    ...project,
    description: apiT(acceptLanguage, 'catalog.exampleDescription'),
    body: apiT(acceptLanguage, 'catalog.exampleBody'),
    cdnRules: (project.cdnRules ?? []).map((rule) => ({ ...rule, label: apiT(acceptLanguage, 'catalog.cdnRuleLabel') })),
    versions: project.versions.map((version) => ({ ...version, changelog: apiT(acceptLanguage, 'catalog.changelog') })),
  })),
})

const getCatalog = (raw?: string, acceptLanguage?: string): Catalog => {
  const example = localizedExampleCatalog(acceptLanguage)
  if (!raw) return example
  try {
    return catalogSchema.parse(JSON.parse(raw))
  } catch {
    return example
  }
}

const flattenFiles = (catalog: Catalog) => catalog.projects.flatMap((project) => project.versions.flatMap((version) => version.files))

const defaultSiteSettings: SiteSettings = {
  appearance: { roundedProjectIcons: true, siteName: 'LunaPost', siteIconUrl: '/assets/projects/luna-launcher/icon.png' },
  moderation: {
    projectCreation: 'full',
    fileSubmission: 'full',
    automatic: { failMode: 'manual', maxFileSize: 512 * 1024 * 1024, blockedExtensions: ['exe', 'bat', 'cmd', 'scr', 'com'], requireHashes: false, requireSource: true },
  },
  registration: { enabled: true, requireInviteCode: false, requireApproval: false, inviteCodes: [] },
  ygg: { enabled: true, allowLocalAccounts: true, accessTokenTtlSeconds: 3600, refreshTokenTtlSeconds: 2592000, upstreams: [] },
  mojang: { enabled: false, clientId: '', tenant: 'consumers' },
  githubActions: { sharedEnabled: false, proxyEnabled: false, ttlSeconds: 300, apiKey: '' },
  storage: { provider: 'r2', endpoint: '', region: '', bucket: '', accessKeyId: '', secretAccessKey: '', publicBaseUrl: '', pathPrefix: '', syncMode: 'manual', directUpload: { enabled: true, roles: ['admin', 'root'], ttlSeconds: 300 }, providers: [{ id: 'primary', name: 'Primary', provider: 'r2', enabled: true, primary: true, priority: 100, endpoint: '', region: '', bucket: '', accessKeyId: '', secretAccessKey: '', publicBaseUrl: '', pathPrefix: '' }] },
}

const normalizeStorageProvider = (raw: any, fallback: any, index: number): StorageProviderConfig => ({
  id: String(raw?.id || fallback?.id || `provider-${index + 1}`).trim().slice(0, 100),
  name: String(raw?.name || fallback?.name || `Storage ${index + 1}`).trim().slice(0, 120),
  provider: raw?.provider === 'tencent_cos' ? 'tencent_cos' : 'r2',
  enabled: raw?.enabled !== false,
  primary: raw?.primary === true,
  priority: Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : (fallback?.priority ?? 0),
  endpoint: typeof raw?.endpoint === 'string' ? raw.endpoint.trim().replace(/\/+$/u, '').slice(0, 500) : (fallback?.endpoint || ''),
  region: typeof raw?.region === 'string' ? raw.region.trim().slice(0, 100) : (fallback?.region || ''),
  bucket: typeof raw?.bucket === 'string' ? raw.bucket.trim().slice(0, 150) : (fallback?.bucket || ''),
  accessKeyId: typeof raw?.accessKeyId === 'string' ? raw.accessKeyId.trim().slice(0, 300) : (fallback?.accessKeyId || ''),
  secretAccessKey: typeof raw?.secretAccessKey === 'string' ? raw.secretAccessKey.trim().slice(0, 500) : (fallback?.secretAccessKey || ''),
  publicBaseUrl: typeof raw?.publicBaseUrl === 'string' ? raw.publicBaseUrl.trim().replace(/\/+$/u, '').slice(0, 500) : (fallback?.publicBaseUrl || ''),
  pathPrefix: typeof raw?.pathPrefix === 'string' ? raw.pathPrefix.trim().replace(/^\/+|\/+$/gu, '').slice(0, 200) : (fallback?.pathPrefix || ''),
})

const normalizeStorageSettings = (raw: any): SiteSettings['storage'] => {
  const legacy = normalizeStorageProvider(raw, defaultSiteSettings.storage, 0)
  const configured: StorageProviderConfig[] = Array.isArray(raw?.providers) && raw.providers.length ? raw.providers.map((item: any, index: number) => normalizeStorageProvider(item, index === 0 ? legacy : undefined, index)) : [legacy]
  const primary = configured.find((item: StorageProviderConfig) => item.primary !== false && item.enabled !== false) ?? configured.find((item: StorageProviderConfig) => item.enabled !== false) ?? configured[0]
  const providers = configured.map((item: StorageProviderConfig, index: number) => ({ ...item, primary: item.id === primary.id || (index === 0 && !configured.some((candidate: StorageProviderConfig) => candidate.primary)) }))
  const selected = providers.find((item: StorageProviderConfig & { primary: boolean }) => item.primary) ?? providers[0]
  const directUpload = raw?.directUpload && typeof raw.directUpload === 'object' ? raw.directUpload : {}
  const validRoles = Array.isArray(directUpload.roles) ? directUpload.roles.filter((role: unknown): role is 'user' | 'developer' | 'admin' | 'root' => ['user', 'developer', 'admin', 'root'].includes(String(role))) : ['admin', 'root']
  return { ...selected, syncMode: raw?.syncMode === 'automatic' ? 'automatic' : 'manual', directUpload: { enabled: directUpload.enabled === undefined ? true : directUpload.enabled === true, roles: validRoles, ttlSeconds: Number.isFinite(Number(directUpload.ttlSeconds)) ? Math.max(60, Math.min(900, Number(directUpload.ttlSeconds))) : 300 }, providers }
}

const randomApiKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `mpk_${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`
}
const encodeBase64 = (bytes: Uint8Array) => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary) }
const decodeBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const encryptBundle = async (value: string, password: string) => { const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']); const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']); const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)); return { format: 'andrea-modpost-encrypted-bundle', schemaVersion: 1, algorithm: 'PBKDF2-SHA256/AES-256-GCM', salt: encodeBase64(salt), iv: encodeBase64(iv), ciphertext: encodeBase64(new Uint8Array(ciphertext)) } }
const decryptBundle = async (bundle: any, password: string) => { const salt = decodeBase64(String(bundle.salt)); const iv = decodeBase64(String(bundle.iv)); const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']); const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, decodeBase64(String(bundle.ciphertext))); return JSON.parse(new TextDecoder().decode(plaintext)) }

const selectSource = (sources: Source[], region: string, requested?: string) => {
  const available = requested ? sources.filter((source) => source.id === requested) : sources
  const candidates = available.length > 0 ? available : sources
  return [...candidates].sort((a, b) => {
    const regionScore = (source: Source) => source.region === region ? 100 : source.region === 'GLOBAL' ? 50 : 0
    return regionScore(b) - regionScore(a) || b.priority - a.priority
  })[0]
}

export const createApp = (options: { authStore?: AccountStore; storage?: StorageAdapter; externalFetch?: typeof fetch } = {}) => {
  const app = new Hono<AppEnv>()
  const memoryStore = new MemoryAccountStore()
  const getAuthStore = (c: { env: AppEnv['Bindings'] }) => options.authStore ?? (c.env.DB ? new D1AccountStore(c.env.DB) : memoryStore)
  const getStorage = async (c: any): Promise<StorageAdapter | null> => {
    if (options.storage) return options.storage
    const settings = await getSiteSettings(c)
    const configured = Array.isArray(settings.storage.providers) && settings.storage.providers.length ? settings.storage.providers : [settings.storage]
    const providers: Array<{ id: string; config: StorageProviderConfig; adapter: StorageAdapter; primary?: boolean }> = []
    for (const [index, raw] of configured.entries()) {
      const config = raw as StorageProviderConfig
      if (config.enabled === false) continue
      let adapter: StorageAdapter | null = null
      if (config.provider === 'tencent_cos' && config.region && config.bucket && config.accessKeyId && config.secretAccessKey) adapter = new TencentCosStorage(config as any)
      else if (config.provider === 'r2' && c.env.STORAGE) adapter = new R2Storage(c.env.STORAGE)
      if (adapter) providers.push({ id: config.id?.trim() || `provider-${index + 1}`, config, adapter, primary: config.primary === true })
    }
    if (!providers.length) return null
    // Hono throws when executionCtx is accessed outside Workers (Node/tests).
    let schedule: ((task: Promise<void>) => void) | undefined
    try { const ctx = c.executionCtx; if (ctx?.waitUntil) schedule = (task) => ctx.waitUntil(task) } catch { /* Node has no background execution context. */ }
    return new StoragePool(providers, settings.storage.syncMode, schedule)
  }
  const storageObjectUrl = async (c: any, key: string) => {
    const settings = await getSiteSettings(c)
    if (settings.storage.publicBaseUrl) {
      const publicKey = [settings.storage.pathPrefix, key].filter(Boolean).join('/')
      return `${settings.storage.publicBaseUrl}/${publicKey.split('/').map((part: string) => encodeURIComponent(part)).join('/')}`
    }
    const origin = new URL(c.env?.PUBLIC_BASE_URL || c.req.url).origin
    return new URL(`/api/v1/storage/${key.split('/').map((part: string) => encodeURIComponent(part)).join('/')}`, origin).href
  }
  const storageKeyFromUrl = async (c: any, value: string) => {
    try {
      const pathname = new URL(value, 'https://storage.invalid').pathname
      const marker = '/api/v1/storage/'
      if (pathname.includes(marker)) return pathname.slice(pathname.indexOf(marker) + marker.length).split('/').map((part) => decodeURIComponent(part)).join('/')
      const settings = await getSiteSettings(c)
      if (!settings.storage.publicBaseUrl) return null
      const publicUrl = new URL(settings.storage.publicBaseUrl, value)
      const candidate = new URL(value, publicUrl).pathname
      const prefix = `/${[settings.storage.pathPrefix].filter(Boolean).join('/')}`
      if (prefix !== '/' && !candidate.startsWith(`${prefix}/`)) return null
      return candidate.slice(prefix === '/' ? 1 : prefix.length + 1).split('/').map((part) => decodeURIComponent(part)).join('/')
    } catch { return null }
  }
  const readStorageSyncStatus = async (c: any, key: string) => {
    const raw = await getAuthStore(c).getAppSetting(`storage_sync:${key}`)
    if (!raw) return null
    try { return JSON.parse(raw) as { key: string; results: StorageSyncResult[]; updatedAt: string } } catch { return null }
  }
  const writeStorageSyncStatus = async (c: any, key: string, results: StorageSyncResult[]) => {
    const value = { key, results, updatedAt: new Date().toISOString() }
    await getAuthStore(c).setAppSetting(`storage_sync:${key}`, JSON.stringify(value))
    return value
  }
  const getCatalogFor = async (c: any): Promise<Catalog> => {
    const base = getCatalog(c.env?.CATALOG_JSON, c.req.header('accept-language'))
    const stored = (await getAuthStore(c).listStoredProjects()).map((project) => projectSchema.parse(project))
    if (!stored.length) return base
    const overrides = new Map(stored.map((project) => [project.slug, project]))
    return { ...base, catalogRevision: `db-${Date.now()}`, generatedAt: new Date().toISOString(), projects: [...base.projects.filter((project) => !overrides.has(project.slug)), ...stored] }
  }
  const getJwtSecret = (c: { env: AppEnv['Bindings'] }) => c.env.JWT_SECRET || 'development-only-change-this-jwt-secret'
  const canPublishAccount = (account: AccountRecord | null) => Boolean(account && ['root', 'admin', 'developer'].includes(account.role))
  const getAccessToken = (c: any) => {
    const authorization = c.req.header('Authorization')
    if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim()
    return getCookie(c, 'mp_access')
  }
  const getCurrentAccount = async (c: any): Promise<AccountRecord | null> => {
    const store = getAuthStore(c)
    const accessToken = getAccessToken(c)
    const identity = await verifyJwt(accessToken, getJwtSecret(c))
    let account = identity?.sub ? await store.getAccount(identity.sub) : null
    if (!account && accessToken && !identity) {
      const apiKey = await store.findApiKey(await hashApiKey(accessToken))
      if (apiKey) {
        account = await store.getAccount(apiKey.accountId)
        c.set('apiKeyScopes', apiKey.scopes)
        c.set('apiKeyId', apiKey.id)
      } else {
        const publishToken = await store.findProjectPublishToken(await hashApiKey(accessToken))
        if (publishToken) {
          account = await store.getAccount(publishToken.accountId)
          c.set('apiKeyScopes', publishToken.scopes)
          c.set('apiKeyId', publishToken.id)
          c.set('publishProjectSlug', publishToken.projectSlug)
        }
      }
    }
    if (!account) {
      const sessionId = getCookie(c, 'mp_session')
      if (sessionId) {
        const session = await store.getSession(await hashSessionId(sessionId))
        if (session) account = await store.getAccount(session.accountId)
      }
    }
    if (account && !c.req.header('Authorization')) {
      const refreshed = await createJwt({ sub: account.id, email: account.email, role: account.role }, getJwtSecret(c))
      setCookie(c, 'mp_access', refreshed, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: 60 * 15 })
    }
    return account
  }
  const requireScope = async (c: any, scope: string) => {
    const account = await getCurrentAccount(c)
    if (!account) return { account: null, error: c.json({ error: { code: 'UNAUTHORIZED', message: '请提供有效的登录凭据' } }, 401) }
    const scopes = c.get('apiKeyScopes') as string[] | undefined
    if (scopes && !scopes.includes(scope) && !scopes.includes('*')) return { account: null, error: c.json({ error: { code: 'SCOPE_REQUIRED', message: `需要 ${scope} 权限` } }, 403) }
    return { account, error: null }
  }
  const requireAdmin = async (c: any) => {
    const account = await getCurrentAccount(c)
    return account && ['root', 'admin'].includes(account.role) ? account : null
  }
  const requireStaff = async (c: any) => {
    const account = await getCurrentAccount(c)
    return canPublishAccount(account) ? account : null
  }
  const canManageProject = async (c: any, project: Project) => {
    const account = await getCurrentAccount(c)
    if (!account) return null
    if (['root', 'admin'].includes(account.role)) return account
    if (account.role !== 'developer') return null
    const members = await getAuthStore(c).listProjectMembers(project.id)
    const member = members.find((item) => item.accountId === account.id)
    if (member && ['owner', 'admin', 'editor'].includes(member.role)) return account
    if (project.ownerType === 'organization' && project.ownerId) {
      const organizationMember = (await getAuthStore(c).listOrganizationMembers(project.ownerId)).find((item) => item.accountId === account.id)
      if (organizationMember && ['owner', 'admin'].includes(organizationMember.role)) return account
    }
    return null
  }
  const canAdminProject = async (c: any, project: Project) => {
    const account = await getCurrentAccount(c)
    if (!account) return null
    if (['root', 'admin'].includes(account.role)) return account
    if (account.role !== 'developer') return null
    const member = (await getAuthStore(c).listProjectMembers(project.id)).find((item) => item.accountId === account.id)
    if (member && ['owner', 'admin'].includes(member.role)) return account
    if (project.ownerType === 'organization' && project.ownerId) {
      const organizationMember = (await getAuthStore(c).listOrganizationMembers(project.ownerId)).find((item) => item.accountId === account.id)
      if (organizationMember && ['owner', 'admin'].includes(organizationMember.role)) return account
    }
    return null
  }
  const getVisibleCatalogFor = async (c: any) => {
    const catalog = await getCatalogFor(c)
    const account = await getCurrentAccount(c)
    if (account && ['root', 'admin'].includes(account.role)) return catalog
    const allowed = new Set<string>()
    if (account?.role === 'developer') {
      for (const project of catalog.projects) {
        if (project.ownerType === 'account' && project.ownerId === account.id) allowed.add(project.slug)
        if (project.ownerType === 'organization' && project.ownerId && (await getAuthStore(c).listOrganizationMembers(project.ownerId)).some((member) => member.accountId === account.id)) allowed.add(project.slug)
        if ((await getAuthStore(c).listProjectMembers(project.id)).some((member) => member.accountId === account.id)) allowed.add(project.slug)
      }
    }
    return {
      ...catalog,
      projects: catalog.projects.filter((project) => project.status === 'approved' || allowed.has(project.slug)).map((project) => ({
        ...project,
        versions: project.versions.map((version) => ({ ...version, files: allowed.has(project.slug) ? version.files : version.files.filter((file) => file.reviewStatus === 'approved') })),
      })),
    }
  }
  const setCatalogCacheControl = async (c: any) => {
    const account = await getCurrentAccount(c)
    c.header('Cache-Control', canPublishAccount(account) ? 'private, no-store' : 'public, max-age=60')
  }
  // Engagement values are read from D1 on every request. Do not let a CDN or
  // browser serve an older download/favorite count after a new event.
  const setEngagementCacheControl = (c: any) => c.header('Cache-Control', 'no-store')
  const getStaffProjectsFor = async (c: any, catalog?: Catalog) => {
    const account = await requireStaff(c)
    const projects = (catalog ?? await getCatalogFor(c)).projects
    if (!account || ['root', 'admin'].includes(account.role)) return account ? projects : []
    const visible: Project[] = []
    for (const project of projects) {
      if (project.ownerType === 'account' && project.ownerId === account.id) {
        visible.push(project)
        continue
      }
      if (project.ownerType === 'organization' && project.ownerId) {
        const organizationMember = (await getAuthStore(c).listOrganizationMembers(project.ownerId)).find((item) => item.accountId === account.id)
        if (organizationMember) {
          visible.push(project)
          continue
        }
      }
      if ((await getAuthStore(c).listProjectMembers(project.id)).some((item) => item.accountId === account.id)) visible.push(project)
    }
    return visible
  }
  const enrichProject = async (c: any, project: Project) => {
    const engagement = await getAuthStore(c).getProjectEngagement(project.slug)
    const account = await getCurrentAccount(c)
    const favorite = account ? await getAuthStore(c).isProjectFavorite(account.id, project.slug) : false
    const canEdit = Boolean(await canManageProject(c, project))
    return { ...project, downloads: (project.downloads ?? 0) + engagement.downloads, followers: (project.followers ?? 0) + engagement.favorites, isFavorite: favorite, canEdit }
  }
  const enrichProjects = async (c: any, projects: Project[]) => Promise.all(projects.map((project) => enrichProject(c, project)))
  const getDefaultSiteAppearance = async (c: any) => {
    const catalog = await getCatalogFor(c)
    const luna = catalog.projects.find((project) => project.slug === 'luna-launcher')
    return { siteName: 'LunaPost', siteIconUrl: luna?.iconUrl || luna?.iconUrls?.[0] || '/assets/projects/luna-launcher/icon.png' }
  }
  const getSiteSettings = async (c: any): Promise<SiteSettings> => {
    const defaultIdentity = await getDefaultSiteAppearance(c)
    const raw = await getAuthStore(c).getAppSetting('site_settings')
    if (!raw) return { ...structuredClone(defaultSiteSettings), appearance: { ...defaultSiteSettings.appearance, ...defaultIdentity } }
    try {
      const value = JSON.parse(raw) as Partial<SiteSettings>
      return {
        appearance: { roundedProjectIcons: value.appearance?.roundedProjectIcons !== false, siteName: value.appearance?.siteName || defaultIdentity.siteName, siteIconUrl: value.appearance?.siteIconUrl ?? defaultIdentity.siteIconUrl },
        registration: { ...defaultSiteSettings.registration, ...(value.registration ?? {}), inviteCodes: Array.isArray(value.registration?.inviteCodes) ? value.registration.inviteCodes : [] },
        ygg: {
          ...defaultSiteSettings.ygg,
          ...(value.ygg ?? {}),
          accessTokenTtlSeconds: Number.isFinite(Number(value.ygg?.accessTokenTtlSeconds)) ? Math.max(300, Math.min(86400, Number(value.ygg?.accessTokenTtlSeconds))) : defaultSiteSettings.ygg.accessTokenTtlSeconds,
          refreshTokenTtlSeconds: Number.isFinite(Number(value.ygg?.refreshTokenTtlSeconds)) ? Math.max(3600, Math.min(31536000, Number(value.ygg?.refreshTokenTtlSeconds))) : defaultSiteSettings.ygg.refreshTokenTtlSeconds,
          upstreams: Array.isArray(value.ygg?.upstreams) ? value.ygg.upstreams.map((item: any, index: number) => {
            const baseUrl = String(item?.baseUrl || '').trim().replace(/\/+$/u, '')
            const endpoint = (name: string) => { const value = String(item?.[name] || '').trim().replace(/\/+$/u, ''); return value || undefined }
            return { id: String(item?.id || `upstream-${index + 1}`).slice(0, 120), name: String(item?.name || `Upstream ${index + 1}`).trim().slice(0, 120), baseUrl, authBaseUrl: endpoint('authBaseUrl') || baseUrl || undefined, sessionBaseUrl: endpoint('sessionBaseUrl') || baseUrl || undefined, profileBaseUrl: endpoint('profileBaseUrl') || endpoint('sessionBaseUrl') || baseUrl || undefined, nameLookupBaseUrl: endpoint('nameLookupBaseUrl') || baseUrl || undefined, enabled: item?.enabled !== false, priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 0 }
          }) : [],
        },
        mojang: { ...defaultSiteSettings.mojang, ...(value.mojang ?? {}), tenant: ['consumers', 'common', 'organizations'].includes(value.mojang?.tenant ?? '') ? value.mojang?.tenant as 'consumers' | 'common' | 'organizations' : 'consumers' },
        githubActions: { sharedEnabled: value.githubActions?.sharedEnabled === true, proxyEnabled: value.githubActions?.proxyEnabled === true, ttlSeconds: Number.isFinite(Number(value.githubActions?.ttlSeconds)) ? Math.max(60, Math.min(86400, Number(value.githubActions?.ttlSeconds))) : defaultSiteSettings.githubActions.ttlSeconds, apiKey: typeof value.githubActions?.apiKey === 'string' ? value.githubActions.apiKey.trim().slice(0, 300) : '' },
        storage: normalizeStorageSettings(value.storage),
        moderation: {
          ...defaultSiteSettings.moderation,
          ...(value.moderation ?? {}),
          automatic: { ...defaultSiteSettings.moderation.automatic, ...(value.moderation?.automatic ?? {}) },
        },
      }
    } catch { return { ...structuredClone(defaultSiteSettings), appearance: { ...defaultSiteSettings.appearance, ...defaultIdentity } } }
  }
  const saveSiteSettings = async (c: any, settings: SiteSettings) => getAuthStore(c).setAppSetting('site_settings', JSON.stringify(settings))
  const runAutomaticModeration = async (c: any, type: 'project' | 'file', payload: unknown, settings: SiteSettings) => {
    const automatic = settings.moderation.automatic
    const project = type === 'project' ? payload as Project : undefined
    const files = project ? flattenFiles({ schemaVersion: 1, catalogRevision: '', generatedAt: '', projects: [project] }) : [payload as any]
    const extensionBlocked = files.some((file) => automatic.blockedExtensions.includes(String(file.name).split('.').pop()?.toLowerCase() ?? ''))
    const missingSource = files.some((file) => automatic.requireSource && (!Array.isArray(file.sources) || file.sources.length === 0))
    const missingHash = files.some((file) => automatic.requireHashes && !file.sha1 && !file.sha512)
    const oversized = files.some((file) => Number(file.size ?? 0) > automatic.maxFileSize)
    if (extensionBlocked || missingSource || missingHash || oversized) return automatic.failMode === 'reject' ? 'reject' as const : 'manual' as const
    if (!automatic.externalApiUrl) return automatic.failMode === 'reject' ? 'reject' as const : 'manual' as const
    try {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000)
      const response = await fetch(automatic.externalApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(c.env.MODERATION_API_TOKEN ? { Authorization: `Bearer ${c.env.MODERATION_API_TOKEN}` } : {}) }, body: JSON.stringify({ type, project: type === 'project' ? payload : undefined, file: type === 'file' ? payload : undefined }), signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`moderation api ${response.status}`)
      const result = await response.json() as { decision?: string }
      if (result.decision === 'approve') return 'approve' as const
      if (result.decision === 'reject') return 'reject' as const
      return 'manual' as const
    } catch { return automatic.failMode === 'reject' ? 'reject' as const : 'manual' as const }
  }
  const moderateSubmission = async (c: any, project: Project, kind: 'project' | 'file') => {
    const settings = await getSiteSettings(c)
    const policy = kind === 'project' ? settings.moderation.projectCreation : settings.moderation.fileSubmission
    if (policy === 'none') return { status: 'approved' as const, files: project.versions.flatMap((version) => version.files) }
    if (policy === 'full') return { status: 'pending' as const, files: project.versions.flatMap((version) => version.files).map((file) => ({ ...file, reviewStatus: 'pending' as const })) }
    const decision = await runAutomaticModeration(c, kind, project, settings)
    return { status: decision === 'approve' ? 'approved' as const : decision === 'reject' ? 'rejected' as const : 'pending' as const, files: project.versions.flatMap((version) => version.files).map((file) => ({ ...file, reviewStatus: decision === 'approve' ? 'approved' as const : decision === 'reject' ? 'rejected' as const : 'pending' as const })) }
  }
  const moderateFiles = async (c: any, project: Project) => {
    const settings = await getSiteSettings(c)
    const policy = settings.moderation.fileSubmission
    const files = project.versions.flatMap((version) => version.files)
    if (policy === 'none') return files.map((file) => ({ ...file, reviewStatus: 'approved' as const }))
    if (policy === 'full') return files.map((file) => ({ ...file, reviewStatus: 'pending' as const }))
    const results = await Promise.all(files.map(async (file) => {
      const decision = await runAutomaticModeration(c, 'file', file, settings)
      return { ...file, reviewStatus: decision === 'approve' ? 'approved' as const : decision === 'reject' ? 'rejected' as const : 'pending' as const }
    }))
    return results
  }

  app.use('*', cors({
    origin: (origin, c) => {
      const configured = (c.env.CORS_ORIGINS ?? 'http://localhost:9000').split(',').map((item: string) => item.trim()).filter(Boolean)
      if (!origin) return configured[0] ?? '*'
      if (configured.includes('http://localhost:9000') && origin === 'http://127.0.0.1:9000') return origin
      if (configured.includes('http://127.0.0.1:9000') && origin === 'http://localhost:9000') return origin
      return configured.includes(origin) ? origin : ''
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    exposeHeaders: ['X-Catalog-Revision'],
  }))

  app.get('/', (c) => c.json({ name: 'andrea-modpost-api', version: '0.1.0' }))

  app.get('/api/v1/health', (c) => c.json({ ok: true, service: 'api' }))

  app.post('/api/v1/auth/register', async (c) => {
    const input = registerSchema.safeParse(await c.req.json().catch(() => null))
    if (!input.success) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidEmailPassword') } }, 400)
    const registration = (await getSiteSettings(c)).registration
    if (!registration.enabled) return c.json({ error: { code: 'REGISTRATION_CLOSED', message: apiT(c.req.header('accept-language'), 'apiErrors.registrationClosed') } }, 403)
    if (registration.requireInviteCode && (!input.data.inviteCode || !registration.inviteCodes.includes(input.data.inviteCode))) return c.json({ error: { code: 'INVITE_CODE_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidInviteCode') } }, 403)
    const email = input.data.email.toLowerCase()
    const store = getAuthStore(c)
    if (await store.findAccountByEmail(email)) return c.json({ error: { code: 'EMAIL_EXISTS', message: apiT(c.req.header('accept-language'), 'apiErrors.emailAlreadyRegistered') } }, 409)
    const account = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(input.data.password),
      createdAt: new Date().toISOString(),
      verifiedAt: registration.requireApproval ? null : new Date().toISOString(),
      role: 'user' as const,
      metadata: { username: email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 40) || undefined },
    }
    try {
      await store.createAccount(account)
    } catch {
      return c.json({ error: { code: 'EMAIL_EXISTS', message: apiT(c.req.header('accept-language'), 'apiErrors.emailAlreadyRegistered') } }, 409)
    }
    if (registration.requireApproval) return c.json({ account: accountView(account), pendingApproval: true }, 202)
    const sessionId = crypto.randomUUID()
    await store.createSession({
      idHash: await hashSessionId(sessionId),
      accountId: account.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    })
    const accessToken = await createJwt({ sub: account.id, email: account.email, role: account.role }, getJwtSecret(c))
    const secure = new URL(c.req.url).protocol === 'https:'
    setCookie(c, 'mp_access', accessToken, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 60 * 15 })
    setCookie(c, 'mp_session', sessionId, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    return c.json({ account: accountView(account), accessToken, tokenType: 'Bearer', expiresIn: 900 }, 201)
  })

  app.post('/api/v1/auth/login', async (c) => {
    const input = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!input.success) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidEmailPassword') } }, 400)
    const store = getAuthStore(c)
    const account = await store.findAccountByEmail(input.data.email.toLowerCase())
    if (!account || !(await verifyPassword(input.data.password, account.passwordHash))) {
      return c.json({ error: { code: 'INVALID_CREDENTIALS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidCredentials') } }, 401)
    }
    const registration = (await getSiteSettings(c)).registration
    if (registration.requireApproval && !account.verifiedAt) return c.json({ error: { code: 'ACCOUNT_PENDING_APPROVAL', message: apiT(c.req.header('accept-language'), 'apiErrors.accountPendingApproval') } }, 403)
    const sessionId = crypto.randomUUID()
    await store.createSession({
      idHash: await hashSessionId(sessionId),
      accountId: account.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    })
    const accessToken = await createJwt({ sub: account.id, email: account.email, role: account.role }, getJwtSecret(c))
    setCookie(c, 'mp_access', accessToken, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: 60 * 15 })
    setCookie(c, 'mp_session', sessionId, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    return c.json({ account: accountView(account), accessToken, tokenType: 'Bearer', expiresIn: 900 })
  })

  app.post('/api/v1/auth/logout', async (c) => {
    const sessionId = getCookie(c, 'mp_session')
    if (sessionId) await getAuthStore(c).deleteSession(await hashSessionId(sessionId))
    deleteCookie(c, 'mp_access', { path: '/' })
    deleteCookie(c, 'mp_session', { path: '/' })
    return c.json({ ok: true })
  })

  app.get('/api/v1/me', async (c) => {
    const account = await getCurrentAccount(c)
    return c.json({ account: account ? accountView(account) : null })
  })

  app.patch('/api/v1/account/profile', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const parsed = accountMetadataSchema.safeParse((await c.req.json().catch(() => null) as { metadata?: unknown } | null)?.metadata)
    if (!parsed.success) return c.json({ error: { code: 'INVALID_PROFILE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidProfile'), details: parsed.error.flatten() } }, 400)
    const metadata = { ...parsed.data, ...(account.role === 'root' ? {} : { minecraftUuid: account.metadata?.minecraftUuid, skinUrl: account.metadata?.skinUrl, capeUrl: account.metadata?.capeUrl, uuidSource: account.metadata?.uuidSource }) }
    await getAuthStore(c).updateAccountMetadata(account.id, metadata)
    const updated = await getAuthStore(c).getAccount(account.id)
    return c.json({ account: updated ? accountView(updated) : accountView(account) })
  })

  app.patch('/api/v1/admin/accounts/:id/minecraft-profile', async (c) => {
    const administrator = await getCurrentAccount(c)
    if (!administrator || administrator.role !== 'root') return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyUpdateUuid') } }, 403)
    const target = await getAuthStore(c).getAccount(c.req.param('id'))
    if (!target) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.accountNotFound') } }, 404)
    const body = await c.req.json().catch(() => null) as { uuid?: string; skinUrl?: string | null; capeUrl?: string | null; source?: 'local' | 'mojang' | 'upstream' } | null
    if (!body) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.emptyRequest') } }, 400)
    const uuid = body.uuid?.replaceAll('-', '').toLowerCase()
    if (!uuid || !/^[0-9a-f]{32}$/u.test(uuid)) return c.json({ error: { code: 'INVALID_UUID', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidUuid') } }, 400)
    let metadata
    try { metadata = accountMetadataSchema.parse({ ...(target.metadata ?? {}), minecraftUuid: uuid, skinUrl: body.skinUrl ?? target.metadata?.skinUrl ?? null, capeUrl: body.capeUrl ?? target.metadata?.capeUrl ?? null, uuidSource: body.source ?? 'local' }) } catch { return c.json({ error: { code: 'INVALID_PROFILE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSkinCapeUrl') } }, 400) }
    await getAuthStore(c).updateAccountMetadata(target.id, metadata)
    return c.json({ ok: true, id: target.id, minecraftUuid: uuid, uuidSource: metadata.uuidSource })
  })

  app.patch('/api/v1/account/minecraft-profile', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const body = await c.req.json().catch(() => null) as { skinUrl?: string | null; capeUrl?: string | null } | null
    if (!body || (body.skinUrl !== undefined && body.skinUrl !== null && typeof body.skinUrl !== 'string') || (body.capeUrl !== undefined && body.capeUrl !== null && typeof body.capeUrl !== 'string')) return c.json({ error: { code: 'INVALID_PROFILE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSkinCapeAddress') } }, 400)
    const skinUrl = body.skinUrl?.trim() || null; const capeUrl = body.capeUrl?.trim() || null
    for (const url of [skinUrl, capeUrl]) if (url && !/^https?:\/\//u.test(url) && !url.startsWith('/api/v1/storage/')) return c.json({ error: { code: 'INVALID_PROFILE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSkinCapeProtocol') } }, 400)
    const metadata = accountMetadataSchema.parse({ ...(account.metadata ?? {}), skinUrl, capeUrl, uuidSource: account.metadata?.uuidSource ?? 'local' })
    await getAuthStore(c).updateAccountMetadata(account.id, metadata)
    return c.json({ account: accountView({ ...account, metadata }) })
  })

  app.get('/api/v1/users', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const query = (c.req.query('query') ?? '').trim().toLowerCase()
    const projectSlug = (c.req.query('project') ?? '').trim()
    const excludedAccountIds = new Set<string>()
    if (projectSlug) {
      const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === projectSlug)
      if (project) {
        if (project.ownerId) excludedAccountIds.add(project.ownerId)
        for (const member of await getAuthStore(c).listProjectMembers(project.id)) excludedAccountIds.add(member.accountId)
      }
    }
    const users = (await getAuthStore(c).listAccounts())
      .filter((item) => !excludedAccountIds.has(item.id) && ['developer', 'admin', 'root'].includes(item.role) && (!query || item.email.toLowerCase().includes(query) || item.id.toLowerCase().includes(query)))
      .slice(0, 20)
      .map((item) => ({ id: item.id, email: item.email, displayName: item.email.split('@')[0], role: item.role }))
    return c.json({ users })
  })

  // Public, stable profile data. The account id is used in URLs so changing an
  // email address never breaks links from project pages or external clients.
  app.get('/api/v1/users/:id', async (c) => {
    const store = getAuthStore(c)
    const account = await store.getAccount(c.req.param('id'))
    if (!account) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.userNotFound') } }, 404)
    const metadata = account.metadata ?? {}
    const handle = metadata.username || account.email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '') || 'user'
    const catalog = await getVisibleCatalogFor(c)
    const projects: Project[] = []
    for (const project of catalog.projects) {
      if (project.status !== 'approved') continue
      if (project.ownerId === account.id) {
        projects.push(project)
        continue
      }
      const member = (await store.listProjectMembers(project.id)).some((item) => item.accountId === account.id)
      if (member) projects.push(project)
    }
    return c.json({
      profile: { id: account.id, handle, displayName: metadata.displayName || handle, avatarUrl: metadata.avatarUrl ?? null, bio: metadata.bio || '', location: metadata.location || '', websiteUrl: metadata.websiteUrl ?? null, githubUrl: metadata.githubUrl ?? null, links: metadata.links ?? [], createdAt: account.createdAt },
      projects,
    })
  })

  app.get('/api/v1/organizations', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    return c.json({ organizations: await getAuthStore(c).listOrganizations(account.id) })
  })

  app.post('/api/v1/organizations', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const body = await c.req.json().catch(() => null) as { slug?: string; name?: string; description?: string; avatarUrl?: string | null } | null
    const parsed = organizationSchema.safeParse({ id: crypto.randomUUID(), slug: body?.slug, name: body?.name, description: body?.description ?? '', avatarUrl: body?.avatarUrl ?? null, createdAt: new Date().toISOString(), ownerId: account.id })
    if (!parsed.success) return c.json({ error: { code: 'INVALID_ORGANIZATION', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidOrganization'), details: parsed.error.flatten() } }, 400)
    if (await getAuthStore(c).getOrganization(parsed.data.slug)) return c.json({ error: { code: 'SLUG_EXISTS', message: apiT(c.req.header('accept-language'), 'apiErrors.organizationSlugExists') } }, 409)
    try {
      await getAuthStore(c).createOrganization(parsed.data)
      await getAuthStore(c).setOrganizationMember(parsed.data.id, account.id, 'owner')
    } catch {
      return c.json({ error: { code: 'SLUG_EXISTS', message: apiT(c.req.header('accept-language'), 'apiErrors.organizationSlugExists') } }, 409)
    }
    return c.json({ organization: parsed.data }, 201)
  })

  app.get('/api/v1/organizations/:slug', async (c) => {
    const organization = await getAuthStore(c).getOrganization(c.req.param('slug'))
    if (!organization) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.organizationNotFound') } }, 404)
    const catalog = await getVisibleCatalogFor(c)
    const projects = catalog.projects.filter((project) => project.status === 'approved' && project.ownerType === 'organization' && project.ownerId === organization.id)
    return c.json({ organization, members: await getAuthStore(c).listOrganizationMembers(organization.id), projects })
  })

  app.get('/api/v1/account/api-keys', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    return c.json({ apiKeys: await getAuthStore(c).listApiKeys(account.id) })
  })

  app.post('/api/v1/account/api-keys', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const body = await c.req.json().catch(() => null) as { name?: string; scopes?: unknown } | null
    const name = body?.name?.trim()
    if (!name || name.length > 80) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidApiKeyName') } }, 400)
    const scopes = Array.isArray(body?.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === 'string').slice(0, 20) : ['read']
    const token = randomApiKey()
    const key = { id: crypto.randomUUID(), accountId: account.id, keyHash: await hashApiKey(token), name, scopes, createdAt: new Date().toISOString(), revokedAt: null }
    await getAuthStore(c).createApiKey(key)
    const { keyHash: _keyHash, accountId: _accountId, ...summary } = key
    return c.json({ apiKey: summary, token }, 201)
  })

  app.delete('/api/v1/account/api-keys/:id', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const revoked = await getAuthStore(c).revokeApiKey(account.id, c.req.param('id'))
    if (!revoked) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.apiKeyNotFound') } }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/v1/setup/status', async (c) => {
    const store = getAuthStore(c)
    const initialized = await store.countAccounts() > 0
    return c.json({
      initialized,
      requiresToken: Boolean(c.env.SETUP_TOKEN),
    })
  })

  app.post('/api/v1/setup/initialize', async (c) => {
    const input = setupInitializeSchema.safeParse(await c.req.json().catch(() => null))
    if (!input.success) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSetupInput') } }, 400)
    const setupToken = c.env.SETUP_TOKEN
    if (setupToken && input.data.token !== setupToken) return c.json({ error: { code: 'INVALID_SETUP_TOKEN', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSetupToken') } }, 403)
    const store = getAuthStore(c)
    if (await store.countAccounts() > 0) return c.json({ error: { code: 'ALREADY_INITIALIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.alreadyInitialized') } }, 409)
    const account = {
      id: crypto.randomUUID(),
      email: input.data.email.toLowerCase(),
      passwordHash: await hashPassword(input.data.password),
      createdAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      role: 'root' as const,
      metadata: { username: input.data.email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 40) || undefined },
    }
    try {
      await store.createAccount(account)
    } catch {
      return c.json({ error: { code: 'INITIALIZATION_FAILED', message: apiT(c.req.header('accept-language'), 'apiErrors.adminCreationFailed') } }, 500)
    }
    const sessionId = crypto.randomUUID()
    await store.createSession({
      idHash: await hashSessionId(sessionId),
      accountId: account.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    })
    const accessToken = await createJwt({ sub: account.id, email: account.email, role: account.role }, getJwtSecret(c))
    const secure = new URL(c.req.url).protocol === 'https:'
    setCookie(c, 'mp_access', accessToken, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 60 * 15 })
    setCookie(c, 'mp_session', sessionId, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    return c.json({ initialized: true, siteName: input.data.siteName, account: accountView(account), accessToken, tokenType: 'Bearer', expiresIn: 900 }, 201)
  })

  app.get('/api/v1/admin/overview', async (c) => {
    const staff = await requireStaff(c)
    if (!staff) return c.json({ error: { code: 'FORBIDDEN', message: 'Developer or admin access required' } }, 403)
    const allCatalog = await getCatalogFor(c)
    const catalog = { ...allCatalog, projects: await getStaffProjectsFor(c, allCatalog) }
    const engagement = await getAuthStore(c).getDashboardStats(catalog.projects.map((project) => project.slug))
    return c.json({ accounts: await getAuthStore(c).countAccounts(), projects: catalog.projects.length, versions: catalog.projects.reduce((total, project) => total + project.versions.length, 0), files: flattenFiles(catalog).length, downloads: engagement.downloads, favorites: engagement.favorites, topDownloads: engagement.topDownloads, topFavorites: engagement.topFavorites })
  })

  app.get('/api/v1/admin/accounts', async (c) => {
    if (!await requireAdmin(c)) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    return c.json({ accounts: await getAuthStore(c).listAccounts() })
  })

  app.get('/api/v1/settings', async (c) => {
    const { appearance, registration, githubActions } = await getSiteSettings(c)
    c.header('Cache-Control', 'no-store')
    return c.json({ settings: { appearance, registration: { enabled: registration.enabled, requireInviteCode: registration.requireInviteCode, requireApproval: registration.requireApproval }, githubActions: { sharedEnabled: githubActions.sharedEnabled, proxyEnabled: githubActions.proxyEnabled, ttlSeconds: githubActions.ttlSeconds } } })
  })

  const githubActionsRequest = (owner: string, repo: string, page: number, perPage: number) => {
    const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts`)
    url.searchParams.set('page', String(page)); url.searchParams.set('per_page', String(perPage))
    return url
  }
  const githubActionsCacheKey = (owner: string, repo: string, page: number, perPage: number) => `github_actions_cache:${owner.toLowerCase()}:${repo.toLowerCase()}:${page}:${perPage}`
  const validGitHubRepoPart = (value: string) => /^[a-zA-Z0-9_.-]{1,100}$/u.test(value)
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  const validGitHubArtifact = (value: unknown) => {
    if (!isRecord(value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || typeof value.name !== 'string' || value.name.length > 256 || typeof value.size_in_bytes !== 'number' || !Number.isSafeInteger(value.size_in_bytes) || value.size_in_bytes < 0 || typeof value.created_at !== 'string' || value.created_at.length > 100 || typeof value.expires_at !== 'string' || value.expires_at.length > 100 || typeof value.expired !== 'boolean') return false
    if (value.workflow_run === undefined || value.workflow_run === null) return true
    if (!isRecord(value.workflow_run) || !Number.isSafeInteger(value.workflow_run.id)) return false
    return (value.workflow_run.head_branch === undefined || value.workflow_run.head_branch === null || typeof value.workflow_run.head_branch === 'string') && (value.workflow_run.head_sha === undefined || typeof value.workflow_run.head_sha === 'string')
  }
  const validGitHubActionsPayload = (value: unknown): value is { total_count: number; artifacts: unknown[] } => isRecord(value) && typeof value.total_count === 'number' && Number.isSafeInteger(value.total_count) && value.total_count >= 0 && Array.isArray(value.artifacts) && value.artifacts.length <= 100 && value.artifacts.every(validGitHubArtifact)
  const readGitHubActionsCache = async (store: AccountStore, key: string, ttlSeconds: number) => {
    const raw = await store.getAppSetting(key)
    if (!raw) return null
    try {
      const cached = JSON.parse(raw) as { savedAt: number; data: unknown }
      return typeof cached.savedAt === 'number' && Number.isFinite(cached.savedAt) && cached.savedAt + ttlSeconds * 1000 > Date.now() && validGitHubActionsPayload(cached.data) ? cached.data : null
    } catch { return null }
  }
  const saveGitHubActionsCache = async (store: AccountStore, key: string, data: unknown) => store.setAppSetting(key, JSON.stringify({ savedAt: Date.now(), data }))

  app.get('/api/v1/github/actions/artifacts', async (c) => {
    const owner = c.req.query('owner')?.trim() ?? ''; const repo = c.req.query('repo')?.trim() ?? ''
    const page = Math.max(1, Math.min(1000, Number(c.req.query('page') ?? 1) || 1)); const perPage = Math.max(1, Math.min(100, Number(c.req.query('per_page') ?? 30) || 30))
    if (!validGitHubRepoPart(owner) || !validGitHubRepoPart(repo)) return c.json({ error: { code: 'INVALID_REPOSITORY', message: 'Invalid GitHub repository' } }, 400)
    const settings = await getSiteSettings(c); const force = c.req.query('refresh') === '1'; const proxyRequested = c.req.query('proxy') === '1'
    c.header('Cache-Control', settings.githubActions.sharedEnabled && !force && !proxyRequested ? `public, max-age=${Math.min(settings.githubActions.ttlSeconds, 300)}` : 'no-store')
    if (!settings.githubActions.sharedEnabled && !proxyRequested) return c.json({ enabled: false })
    const store = getAuthStore(c); const key = githubActionsCacheKey(owner, repo, page, perPage); const cached = settings.githubActions.sharedEnabled && !force ? await readGitHubActionsCache(store, key, settings.githubActions.ttlSeconds) : null
    if (cached) return c.json({ enabled: true, cached: true, data: cached })
    try {
      if (!proxyRequested || !settings.githubActions.proxyEnabled) return c.json({ enabled: settings.githubActions.sharedEnabled, cached: false, error: { status: 424 } }, 424)
      const response = await (options.externalFetch ?? fetch)(githubActionsRequest(owner, repo, page, perPage), { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LunaPost', ...(settings.githubActions.apiKey ? { Authorization: `Bearer ${settings.githubActions.apiKey}` } : {}) } })
      if (!response.ok) return c.json({ enabled: true, cached: false, error: { status: response.status } }, response.status as any)
      const data = await response.json(); if (!validGitHubActionsPayload(data)) return c.json({ enabled: true, cached: false, error: { status: 502 } }, 502)
      if (settings.githubActions.sharedEnabled) await saveGitHubActionsCache(store, key, data)
      return c.json({ enabled: true, cached: false, data })
    } catch { return c.json({ enabled: true, cached: false, error: { status: 502 } }, 502) }
  })

  app.post('/api/v1/github/actions/artifacts/cache', async (c) => {
    const owner = c.req.query('owner')?.trim() ?? ''; const repo = c.req.query('repo')?.trim() ?? ''
    const page = Math.max(1, Math.min(1000, Number(c.req.query('page') ?? 1) || 1)); const perPage = Math.max(1, Math.min(100, Number(c.req.query('per_page') ?? 30) || 30))
    if (!validGitHubRepoPart(owner) || !validGitHubRepoPart(repo)) return c.json({ error: { code: 'INVALID_REPOSITORY', message: 'Invalid GitHub repository' } }, 400)
    const settings = await getSiteSettings(c); if (!settings.githubActions.sharedEnabled) return c.json({ enabled: false })
    const contentLength = Number(c.req.header('content-length') ?? 0)
    if (contentLength > 2_000_000) return c.json({ error: { code: 'CACHE_PAYLOAD_TOO_LARGE', message: 'GitHub Actions cache payload is too large' } }, 413)
    const body = await c.req.json().catch(() => null) as unknown
    if (!validGitHubActionsPayload(body)) return c.json({ error: { code: 'INVALID_CACHE_PAYLOAD', message: 'Invalid GitHub Actions cache payload' } }, 400)
    await saveGitHubActionsCache(getAuthStore(c), githubActionsCacheKey(owner, repo, page, perPage), body); return c.json({ enabled: true, saved: true })
  })

  app.get('/api/v1/admin/settings', async (c) => {
    const administrator = await requireAdmin(c)
    if (!administrator) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const settings = await getSiteSettings(c)
    return c.json({ settings: administrator.role === 'root' ? settings : { ...settings, githubActions: { ...settings.githubActions, apiKey: '' }, storage: { ...settings.storage, accessKeyId: '', secretAccessKey: '', providers: settings.storage.providers.map((provider) => ({ ...provider, accessKeyId: '', secretAccessKey: '' })) } } })
  })

  app.get('/api/v1/admin/database/export', async (c) => {
    const administrator = await getCurrentAccount(c)
    if (!administrator || administrator.role !== 'root') return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyExportSnapshot') } }, 403)
    const store = getAuthStore(c); const summaries = await store.listAccounts(); const accounts = []
    for (const summary of summaries) { const account = await store.getAccount(summary.id); if (account) accounts.push(account) }
    const organizations = await store.listOrganizations(); const organizationMembers = []
    for (const organization of organizations) organizationMembers.push({ organizationId: organization.id, members: await store.listOrganizationMembers(organization.id) })
    const projects = (await getCatalogFor(c)).projects
    const projectMembers = []
    for (const project of projects) projectMembers.push({ projectId: project.id, members: await store.listProjectMembers(project.id) })
    const bundle = { format: 'andrea-modpost-bundle', schemaVersion: 1, createdAt: new Date().toISOString(), source: 'root-export', siteSettings: await store.getAppSetting('site_settings'), accounts, projects, projectMembers, organizations, organizationMembers }
    c.header('Content-Type', 'application/json; charset=utf-8'); c.header('Content-Disposition', `attachment; filename="andrea-modpost-${new Date().toISOString().slice(0, 10)}.modpost.json"`); return c.json(bundle)
  })

  app.post('/api/v1/admin/database/export', async (c) => {
    const administrator = await getCurrentAccount(c); if (!administrator || administrator.role !== 'root') return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyExportSnapshot') } }, 403)
    const body = await c.req.json().catch(() => null) as { password?: string } | null; if (!body?.password || body.password.length < 12) return c.json({ error: { code: 'INVALID_PASSWORD', message: apiT(c.req.header('accept-language'), 'apiErrors.snapshotPasswordTooShort') } }, 400)
    const store = getAuthStore(c); const accounts = []; for (const summary of await store.listAccounts()) { const account = await store.getAccount(summary.id); if (account) accounts.push(account) }
    const organizations = await store.listOrganizations(); const organizationMembers = []; for (const organization of organizations) organizationMembers.push({ organizationId: organization.id, members: await store.listOrganizationMembers(organization.id) }); const projects = (await getCatalogFor(c)).projects; const projectMembers = []; for (const project of projects) projectMembers.push({ projectId: project.id, members: await store.listProjectMembers(project.id) })
    const bundle = { format: 'andrea-modpost-bundle', schemaVersion: 1, createdAt: new Date().toISOString(), source: 'root-export', siteSettings: await store.getAppSetting('site_settings'), accounts, projects, projectMembers, organizations, organizationMembers }
    return c.json(await encryptBundle(JSON.stringify(bundle), body.password))
  })

  app.post('/api/v1/admin/database/import', async (c) => {
    const administrator = await getCurrentAccount(c)
    if (!administrator || administrator.role !== 'root') return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyImportSnapshot') } }, 403)
    let body = await c.req.json().catch(() => null) as any
    if (body?.format === 'andrea-modpost-encrypted-bundle') { if (!body.password || typeof body.password !== 'string') return c.json({ error: { code: 'PASSWORD_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.snapshotPasswordRequired') } }, 400); try { body = await decryptBundle(body, body.password) } catch { return c.json({ error: { code: 'INVALID_PASSWORD', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSnapshotPassword') } }, 400) } }
    if (!body || body.format !== 'andrea-modpost-bundle' || body.schemaVersion !== 1 || !Array.isArray(body.accounts) || !Array.isArray(body.projects) || !Array.isArray(body.organizations)) return c.json({ error: { code: 'INVALID_BUNDLE', message: apiT(c.req.header('accept-language'), 'apiErrors.unsupportedSnapshotFormat') } }, 400)
    if (body.accounts.length > 10_000 || body.projects.length > 10_000 || body.organizations.length > 2_000) return c.json({ error: { code: 'BUNDLE_TOO_LARGE', message: apiT(c.req.header('accept-language'), 'apiErrors.snapshotTooLarge') } }, 413)
    const store = getAuthStore(c); let createdAccounts = 0; let updatedAccounts = 0; let createdProjects = 0; let updatedProjects = 0; let createdOrganizations = 0; let skippedMembers = 0
    const accountIds = new Map<string, string>()
    const organizationIds = new Map<string, string>()
    try {
      for (const item of body.accounts) {
        if (!item?.id || !item.email || !item.passwordHash) continue
        // A fresh Cloudflare instance already has the root created by /setup. Match
        // by email as well as ID so importing that same account is idempotent.
        const existing = await store.getAccount(String(item.id)) ?? await store.findAccountByEmail(String(item.email).toLowerCase())
        if (existing) { accountIds.set(String(item.id), existing.id); await store.updateAccountMetadata(existing.id, item.metadata ?? {}); await store.updateRole(existing.id, item.role ?? 'user'); await store.setAccountVerified(existing.id, item.verifiedAt ?? null); updatedAccounts += 1 }
        else { const created = { id: String(item.id), email: String(item.email).toLowerCase(), passwordHash: String(item.passwordHash), createdAt: String(item.createdAt || new Date().toISOString()), verifiedAt: item.verifiedAt ?? null, role: ['user', 'developer', 'admin', 'root'].includes(item.role) ? item.role : 'user' as const, metadata: item.metadata ?? {} }; await store.createAccount(created); accountIds.set(String(item.id), created.id); createdAccounts += 1 }
      }
      for (const project of body.projects) { if (!project?.slug || !project.id) continue; const existing = await store.getStoredProject(String(project.slug)); await store.saveStoredProject(project); if (existing) updatedProjects += 1; else createdProjects += 1 }
      for (const organization of body.organizations) { if (!organization?.id || !organization.slug) continue; const existing = await store.getOrganization(String(organization.slug)); if (existing) organizationIds.set(String(organization.id), existing.id); else { await store.createOrganization({ ...organization, ownerId: accountIds.get(organization.ownerId) ?? organization.ownerId }); organizationIds.set(String(organization.id), String(organization.id)); createdOrganizations += 1 } }
      for (const entry of Array.isArray(body.organizationMembers) ? body.organizationMembers : []) for (const member of Array.isArray(entry.members) ? entry.members : []) if (entry.organizationId && member.accountId) { const organizationId = organizationIds.get(String(entry.organizationId)); const accountId = accountIds.get(String(member.accountId)) ?? String(member.accountId); if (organizationId && await store.getAccount(accountId)) await store.setOrganizationMember(organizationId, accountId, member.role); else skippedMembers += 1 }
      for (const entry of Array.isArray(body.projectMembers) ? body.projectMembers : []) for (const member of Array.isArray(entry.members) ? entry.members : []) if (entry.projectId && member.accountId) { const accountId = accountIds.get(String(member.accountId)) ?? String(member.accountId); if (await store.getAccount(accountId)) await store.setProjectMember(String(entry.projectId), accountId, member.role); else skippedMembers += 1 }
      if (typeof body.siteSettings === 'string') await store.setAppSetting('site_settings', body.siteSettings)
      return c.json({ ok: true, summary: { createdAccounts, updatedAccounts, createdProjects, updatedProjects, createdOrganizations, skippedMembers } })
    } catch (error) {
      console.error('database import failed', error)
      return c.json({ error: { code: 'IMPORT_FAILED', message: apiT(c.req.header('accept-language'), 'apiErrors.snapshotImportConflict') } }, 409)
    }
  })

  app.put('/api/v1/admin/settings', async (c) => {
    const administrator = await requireAdmin(c)
    if (!administrator) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const current = await getSiteSettings(c)
    const body = await c.req.json().catch(() => null) as Partial<SiteSettings> | null
    const appearance = body?.appearance
    if (appearance !== undefined && (!appearance || typeof appearance !== 'object' || Array.isArray(appearance) || (appearance.roundedProjectIcons !== undefined && typeof appearance.roundedProjectIcons !== 'boolean') || (appearance.siteName !== undefined && typeof appearance.siteName !== 'string') || (appearance.siteIconUrl !== undefined && typeof appearance.siteIconUrl !== 'string'))) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidAppearanceSettings') } }, 400)
    const roundedProjectIcons = appearance?.roundedProjectIcons ?? current.appearance.roundedProjectIcons
    const siteName = appearance?.siteName?.trim() || current.appearance.siteName
    const siteIconUrl = appearance?.siteIconUrl?.trim() ?? current.appearance.siteIconUrl
    if (!siteName || siteName.length > 80 || siteIconUrl.length > 2_000 || (siteIconUrl && !(/^(?:https?:\/\/|\/)/u.test(siteIconUrl)))) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSiteIdentity') } }, 400)
    if (administrator.role !== 'root' && (siteName !== current.appearance.siteName || siteIconUrl !== current.appearance.siteIconUrl)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyEditSiteIdentity') } }, 403)
    const registration = body?.registration
    if (!registration || typeof registration.enabled !== 'boolean' || typeof registration.requireInviteCode !== 'boolean' || typeof registration.requireApproval !== 'boolean' || !Array.isArray(registration.inviteCodes)) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidRegistrationSettings') } }, 400)
    const inviteCodes = registration.inviteCodes.map((item) => String(item).trim()).filter(Boolean).slice(0, 100)
    const moderation = body?.moderation
    if (!moderation || !['none', 'automatic', 'full'].includes(moderation.projectCreation ?? '') || !['none', 'automatic', 'full'].includes(moderation.fileSubmission ?? '')) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidModerationPolicy') } }, 400)
    const automatic = { ...current.moderation.automatic, ...(moderation.automatic ?? {}) }
    if (!['manual', 'reject'].includes(automatic.failMode) || !Number.isFinite(Number(automatic.maxFileSize)) || Number(automatic.maxFileSize) <= 0 || !Array.isArray(automatic.blockedExtensions)) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidAutomaticModeration') } }, 400)
    const ygg = body?.ygg ?? current.ygg
    if (typeof ygg.enabled !== 'boolean' || typeof ygg.allowLocalAccounts !== 'boolean' || !Array.isArray(ygg.upstreams)) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidYggSettings') } }, 400)
    const upstreams = ygg.upstreams.map((item: any, index: number) => {
      const endpoint = (name: string) => String(item?.[name] || '').trim().replace(/\/+$/u, '')
      const baseUrl = endpoint('baseUrl')
      const authBaseUrl = endpoint('authBaseUrl') || baseUrl
      const sessionBaseUrl = endpoint('sessionBaseUrl') || baseUrl
      const profileBaseUrl = endpoint('profileBaseUrl') || sessionBaseUrl
      const nameLookupBaseUrl = endpoint('nameLookupBaseUrl') || baseUrl
      return { id: String(item?.id || crypto.randomUUID()).slice(0, 120), name: String(item?.name || apiT(c.req.header('accept-language'), 'admin.upstreamName', { number: index + 1 })).trim().slice(0, 120), baseUrl, authBaseUrl, sessionBaseUrl, profileBaseUrl, nameLookupBaseUrl, enabled: item?.enabled !== false, priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 0 }
    }).filter((item: any) => [item.baseUrl, item.authBaseUrl, item.sessionBaseUrl, item.profileBaseUrl, item.nameLookupBaseUrl].some((value) => value && /^https?:\/\//u.test(value))).slice(0, 20)
    const mojang = body?.mojang ?? current.mojang
    if (!mojang || typeof mojang.enabled !== 'boolean' || typeof mojang.clientId !== 'string' || !['consumers', 'common', 'organizations'].includes(mojang.tenant ?? '')) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidMojangSettings') } }, 400)
    const githubActions = body?.githubActions ?? current.githubActions
    if (!githubActions || typeof githubActions.sharedEnabled !== 'boolean' || typeof githubActions.proxyEnabled !== 'boolean' || !Number.isInteger(Number(githubActions.ttlSeconds)) || Number(githubActions.ttlSeconds) < 60 || Number(githubActions.ttlSeconds) > 86400 || (githubActions.apiKey !== undefined && typeof githubActions.apiKey !== 'string')) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'Invalid GitHub Actions cache settings' } }, 400)
    const githubApiKey = administrator.role === 'root' ? String(githubActions.apiKey ?? '').trim().slice(0, 300) : current.githubActions.apiKey
    const storage = body?.storage ?? current.storage
    if (!storage || !['r2', 'tencent_cos'].includes(storage.provider ?? '')) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'Invalid storage settings' } }, 400)
    const requestedProviders = Array.isArray(storage.providers) && storage.providers.length ? storage.providers : [storage]
    if (requestedProviders.length < 1 || requestedProviders.length > 12) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'Storage providers must contain between 1 and 12 entries' } }, 400)
    const currentProviders = new Map(current.storage.providers.map((provider) => [provider.id, provider]))
    // Apply changed primary form fields without undoing independent JSON edits.
    const primaryFields = ['provider', 'endpoint', 'region', 'bucket', 'accessKeyId', 'secretAccessKey', 'publicBaseUrl', 'pathPrefix'] as const
    const formChanges = Object.fromEntries(primaryFields.filter((key) => storage[key] !== undefined && storage[key] !== current.storage[key] && (administrator.role === 'root' || !['accessKeyId', 'secretAccessKey'].includes(key))).map((key) => [key, storage[key]]))
    const primaryIndex = requestedProviders.findIndex((item) => item.primary && item.enabled !== false)
    const editedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : requestedProviders.findIndex((item) => item.enabled !== false)
    const storageProviders = requestedProviders.map((item: any, index: number) => {
      const existing = currentProviders.get(String(item?.id || ''))
      const normalized = normalizeStorageProvider(index === editedPrimaryIndex ? { ...item, ...formChanges } : item, existing, index)
      if (administrator.role !== 'root') { normalized.accessKeyId = existing?.accessKeyId || ''; normalized.secretAccessKey = existing?.secretAccessKey || '' }
      return normalized
    })
    if (storageProviders.filter((item) => item.enabled !== false).length === 0 || storageProviders.filter((item) => item.primary).length > 1) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'At least one storage provider must be enabled and only one may be primary' } }, 400)
    if (new Set(storageProviders.map((item) => item.id)).size !== storageProviders.length) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'Storage provider IDs must be unique' } }, 400)
    const primaryStorage = storageProviders.find((item) => item.primary) ?? storageProviders.find((item) => item.enabled !== false)
    storageProviders.forEach((item) => { item.primary = item.id === primaryStorage?.id })
    for (const item of storageProviders) if (item.provider === 'tencent_cos' && item.enabled !== false && (!item.region || !item.bucket || !item.accessKeyId || !item.secretAccessKey)) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'Tencent COS requires region, bucket, access key and secret key' } }, 400)
    const directUpload = storage.directUpload ?? current.storage.directUpload
    const directRoles = Array.isArray(directUpload?.roles) ? directUpload.roles.filter((role: unknown): role is 'user' | 'developer' | 'admin' | 'root' => ['user', 'developer', 'admin', 'root'].includes(String(role))) : current.storage.directUpload.roles
    if (typeof directUpload?.enabled !== 'boolean' || !directRoles.length || !Number.isInteger(Number(directUpload.ttlSeconds)) || Number(directUpload.ttlSeconds) < 60 || Number(directUpload.ttlSeconds) > 900) return c.json({ error: { code: 'INVALID_SETTINGS', message: 'Invalid direct upload settings' } }, 400)
    const storageSettings = { ...primaryStorage!, syncMode: storage.syncMode === 'automatic' ? 'automatic' as const : current.storage.syncMode, directUpload: { enabled: directUpload.enabled, roles: directRoles, ttlSeconds: Number(directUpload.ttlSeconds) }, providers: storageProviders }
    const yggAccessTtl = administrator.role === 'root' ? Number(ygg.accessTokenTtlSeconds) : current.ygg.accessTokenTtlSeconds
    const yggRefreshTtl = administrator.role === 'root' ? Number(ygg.refreshTokenTtlSeconds) : current.ygg.refreshTokenTtlSeconds
    if (!Number.isInteger(yggAccessTtl) || yggAccessTtl < 300 || yggAccessTtl > 86400 || !Number.isInteger(yggRefreshTtl) || yggRefreshTtl < 3600 || yggRefreshTtl > 31536000 || yggRefreshTtl <= yggAccessTtl) return c.json({ error: { code: 'INVALID_SETTINGS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidYggTokenLifetime') } }, 400)
    const settings: SiteSettings = { appearance: { roundedProjectIcons, siteName, siteIconUrl }, registration: { enabled: registration.enabled, requireInviteCode: registration.requireInviteCode, requireApproval: registration.requireApproval, inviteCodes }, moderation: { projectCreation: moderation.projectCreation as ModerationPolicy, fileSubmission: moderation.fileSubmission as ModerationPolicy, automatic: { ...automatic, maxFileSize: Number(automatic.maxFileSize), blockedExtensions: automatic.blockedExtensions.map((item) => String(item).toLowerCase().replace(/^\./u, '')).filter(Boolean) } }, ygg: { enabled: ygg.enabled, allowLocalAccounts: ygg.allowLocalAccounts, accessTokenTtlSeconds: yggAccessTtl, refreshTokenTtlSeconds: yggRefreshTtl, upstreams }, mojang: { enabled: mojang.enabled, clientId: mojang.clientId.trim().slice(0, 200), tenant: mojang.tenant }, githubActions: { sharedEnabled: githubActions.sharedEnabled, proxyEnabled: githubActions.proxyEnabled, ttlSeconds: Number(githubActions.ttlSeconds), apiKey: githubApiKey }, storage: storageSettings }
    await saveSiteSettings(c, settings)
    return c.json({ settings: administrator.role === 'root' ? settings : { ...settings, githubActions: { ...settings.githubActions, apiKey: '' }, storage: { ...settings.storage, accessKeyId: '', secretAccessKey: '', providers: settings.storage.providers.map((provider) => ({ ...provider, accessKeyId: '', secretAccessKey: '' })) } } })
  })

  app.patch('/api/v1/admin/accounts/:id/verification', async (c) => {
    if (!await requireAdmin(c)) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const body = await c.req.json().catch(() => null) as { approved?: boolean } | null
    if (typeof body?.approved !== 'boolean') return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.approvedMustBeBoolean') } }, 400)
    const verifiedAt = body.approved ? new Date().toISOString() : null
    if (!await getAuthStore(c).setAccountVerified(c.req.param('id'), verifiedAt)) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.accountNotFound') } }, 404)
    return c.json({ ok: true, verifiedAt })
  })

  app.patch('/api/v1/admin/accounts/:id/role', async (c) => {
    const administrator = await requireAdmin(c)
    if (!administrator) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const body = await c.req.json().catch(() => null) as { role?: string } | null
    if (!['user', 'developer', 'admin', 'root'].includes(body?.role ?? '')) return c.json({ error: { code: 'INVALID_ROLE', message: 'Role must be user, developer, admin or root' } }, 400)
    const target = await getAuthStore(c).getAccount(c.req.param('id'))
    if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404)
    if (administrator.role !== 'root' && (target.role === 'root' || body?.role === 'root')) return c.json({ error: { code: 'ROOT_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyManageRoot') } }, 403)
    if (c.req.param('id') === administrator.id && body?.role !== administrator.role) return c.json({ error: { code: 'SELF_DEMOTION', message: apiT(c.req.header('accept-language'), 'apiErrors.cannotDemoteSelf') } }, 409)
    if (target.role === 'root' && body?.role !== 'root' && (await getAuthStore(c).listAccounts()).filter((account) => account.role === 'root').length <= 1) return c.json({ error: { code: 'LAST_ROOT', message: apiT(c.req.header('accept-language'), 'apiErrors.lastRootRequired') } }, 409)
    const changed = await getAuthStore(c).updateRole(c.req.param('id'), body?.role as AccountRole)
    if (!changed) return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404)
    return c.json({ ok: true, id: c.req.param('id'), role: body?.role })
  })

  app.delete('/api/v1/admin/accounts/:id', async (c) => {
    const administrator = await requireAdmin(c)
    if (!administrator) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const id = c.req.param('id')
    if (id === administrator.id) return c.json({ error: { code: 'SELF_DELETE', message: apiT(c.req.header('accept-language'), 'apiErrors.cannotDeleteSelf') } }, 409)
    const accounts = await getAuthStore(c).listAccounts()
    const target = accounts.find((account) => account.id === id)
    if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404)
    if (target.role === 'root') {
      if (administrator.role !== 'root') return c.json({ error: { code: 'ROOT_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.rootOnlyDeleteRoot') } }, 403)
      if (accounts.filter((account) => account.role === 'root').length <= 1) return c.json({ error: { code: 'LAST_ROOT', message: apiT(c.req.header('accept-language'), 'apiErrors.lastRootRequired') } }, 409)
    } else if (target.role === 'admin' && accounts.filter((account) => account.role === 'admin').length <= 1) {
      return c.json({ error: { code: 'LAST_ADMIN', message: apiT(c.req.header('accept-language'), 'apiErrors.lastAdminRequired') } }, 409)
    }
    const deleted = await getAuthStore(c).deleteAccount(id)
    if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404)
    return c.json({ ok: true, id })
  })

  app.get('/api/v1/admin/projects', async (c) => {
    const staff = await requireStaff(c)
    if (!staff) return c.json({ error: { code: 'FORBIDDEN', message: 'Developer or admin access required' } }, 403)
    return c.json({ projects: await getStaffProjectsFor(c) })
  })

  app.get('/api/v1/admin/reviews', async (c) => {
    if (!await requireAdmin(c)) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const projects = await getCatalogFor(c)
    const queue = projects.projects.flatMap((project) => [
      ...(project.status === 'pending' ? [{ type: 'project' as const, id: project.id, slug: project.slug, title: project.title, status: project.status, ownerId: project.ownerId }] : []),
      ...project.versions.flatMap((version) => version.files.filter((file) => file.reviewStatus === 'pending').map((file) => ({ type: 'file' as const, id: file.id, slug: project.slug, title: `${project.title} · ${file.name}`, status: file.reviewStatus, ownerId: project.ownerId }))),
    ])
    return c.json({ reviews: queue })
  })

  app.post('/api/v1/admin/reviews/projects/:slug', async (c) => {
    const reviewer = await requireAdmin(c)
    if (!reviewer) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const slug = c.req.param('slug'); const body = await c.req.json().catch(() => null) as { decision?: string; note?: string } | null
    if (body?.decision !== 'approve' && body?.decision !== 'reject') return c.json({ error: { code: 'INVALID_DECISION', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidReviewDecision') } }, 400)
    const project = await getAuthStore(c).getStoredProject(slug)
    if (!project) return c.json({ error: { code: 'STATIC_PROJECT', message: apiT(c.req.header('accept-language'), 'apiErrors.staticProjectEdit') } }, 409)
    const status = body.decision === 'approve' ? 'approved' as const : 'rejected' as const
    await getAuthStore(c).saveStoredProject({ ...project, status, versions: project.versions.map((version) => ({ ...version, files: version.files.map((file) => file.reviewStatus === 'pending' ? { ...file, reviewStatus: status, reviewNote: body.note, reviewedAt: new Date().toISOString(), reviewedBy: reviewer.id } : file) })) })
    if (project.ownerType === 'account' && project.ownerId) await getAuthStore(c).createNotification({ id: crypto.randomUUID(), accountId: project.ownerId, type: `project_${status}`, title: status === 'approved' ? apiT(c.req.header('accept-language'), 'notifications.projectApproved') : apiT(c.req.header('accept-language'), 'notifications.projectRejected'), body: body.note ?? '', data: { slug }, readAt: null, createdAt: new Date().toISOString() })
    return c.json({ ok: true, status })
  })

  app.post('/api/v1/admin/reviews/files/:fileId', async (c) => {
    const reviewer = await requireAdmin(c)
    if (!reviewer) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const body = await c.req.json().catch(() => null) as { decision?: string; note?: string } | null
    if (body?.decision !== 'approve' && body?.decision !== 'reject') return c.json({ error: { code: 'INVALID_DECISION', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidReviewDecision') } }, 400)
    const catalog = await getCatalogFor(c); const match = catalog.projects.find((project) => project.versions.some((version) => version.files.some((file) => file.id === c.req.param('fileId'))))
    if (!match) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.fileNotFound') } }, 404)
    const project = await getAuthStore(c).getStoredProject(match.slug)
    if (!project) return c.json({ error: { code: 'STATIC_PROJECT', message: apiT(c.req.header('accept-language'), 'apiErrors.staticProjectEdit') } }, 409)
    const status = body.decision === 'approve' ? 'approved' as const : 'rejected' as const
    const now = new Date().toISOString()
    await getAuthStore(c).saveStoredProject({ ...project, versions: project.versions.map((version) => ({ ...version, files: version.files.map((file) => file.id === c.req.param('fileId') ? { ...file, reviewStatus: status, reviewNote: body.note, reviewedAt: now, reviewedBy: reviewer.id } : file) })) })
    return c.json({ ok: true, status })
  })

  app.post('/api/v1/admin/projects', async (c) => {
    const auth = await requireScope(c, 'project:create')
    const owner = auth.account
    if (auth.error) return auth.error
    if (!owner) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    if (!canPublishAccount(owner)) return c.json({ error: { code: 'PUBLISHER_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.publisherRequired') } }, 403)
    const parsed = projectSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: { code: 'INVALID_PROJECT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidProject'), details: parsed.error.flatten() } }, 400)
    const existing = await getCatalogFor(c)
    const dependencyErrors = validateDependencies(parsed.data, await getVisibleCatalogFor(c))
    if (dependencyErrors.length) return c.json({ error: { code: 'INVALID_DEPENDENCIES', message: dependencyErrors.join('; ') } }, 400)
    if (existing.projects.some((project) => project.slug === parsed.data.slug)) return c.json({ error: { code: 'SLUG_EXISTS', message: apiT(c.req.header('accept-language'), 'apiErrors.slugExists') } }, 409)
    let ownerId = owner.id
    const ownerType = parsed.data.ownerType ?? 'account'
    if (ownerType === 'organization') {
      if (!parsed.data.ownerId) return c.json({ error: { code: 'ORGANIZATION_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.organizationRequired') } }, 400)
      const organization = await getAuthStore(c).getOrganization(parsed.data.ownerId)
      const membership = organization ? (await getAuthStore(c).listOrganizationMembers(organization.id)).find((member) => member.accountId === owner.id) : null
      if (!organization || !membership || !['owner', 'admin'].includes(membership.role)) return c.json({ error: { code: 'ORGANIZATION_FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.organizationPublishForbidden') } }, 403)
      ownerId = organization.id
    }
    let project = { ...parsed.data, ownerType, ownerId }
    if (owner.role === 'developer') {
      const moderation = await moderateSubmission(c, project, 'project')
      const moderatedFiles = await moderateFiles(c, project)
      let fileIndex = 0
      project = { ...project, status: moderation.status, versions: project.versions.map((version) => ({ ...version, files: version.files.map(() => moderatedFiles[fileIndex++]) })) }
    }
    await getAuthStore(c).saveStoredProject(project)
    await getAuthStore(c).setProjectMember(project.id, owner.id, 'owner')
    return c.json({ project }, 201)
  })

  app.put('/api/v1/admin/projects/:slug', async (c) => {
    const auth = await requireScope(c, 'project:write')
    const editor = auth.account
    if (auth.error) return auth.error
    if (!editor || !canPublishAccount(editor)) return c.json({ error: { code: 'PUBLISHER_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.publisherEditRequired') } }, 403)
    const parsed = projectSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: { code: 'INVALID_PROJECT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidProject'), details: parsed.error.flatten() } }, 400)
    const slug = c.req.param('slug')
    const existing = await getCatalogFor(c)
    const dependencyErrors = validateDependencies(parsed.data, await getVisibleCatalogFor(c))
    if (dependencyErrors.length) return c.json({ error: { code: 'INVALID_DEPENDENCIES', message: dependencyErrors.join('; ') } }, 400)
    const current = existing.projects.find((project) => project.slug === slug)
    if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if (!await canManageProject(c, current)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.projectEditForbidden') } }, 403)
    if (parsed.data.slug !== slug && existing.projects.some((project) => project.slug === parsed.data.slug)) return c.json({ error: { code: 'SLUG_EXISTS', message: apiT(c.req.header('accept-language'), 'apiErrors.newSlugExists') } }, 409)
    if (parsed.data.slug !== slug) await getAuthStore(c).deleteStoredProject(slug)
    let project = { ...parsed.data, ownerType: current.ownerType ?? 'account', ownerId: current.ownerId }
    if (editor.role === 'developer') {
      const moderation = await moderateSubmission(c, project, 'project')
      const moderatedFiles = await moderateFiles(c, project)
      let fileIndex = 0
      project = { ...project, status: moderation.status, versions: project.versions.map((version) => ({ ...version, files: version.files.map(() => moderatedFiles[fileIndex++]) })) }
    }
    await getAuthStore(c).saveStoredProject(project)
    return c.json({ project })
  })

  app.delete('/api/v1/admin/projects/:slug', async (c) => {
    const slug = c.req.param('slug')
    const current = (await getCatalogFor(c)).projects.find((project) => project.slug === slug)
    if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if (!await canAdminProject(c, current)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.projectAdminForbidden') } }, 403)
    const removed = await getAuthStore(c).deleteStoredProject(slug)
    if (!removed) return c.json({ error: { code: 'STATIC_PROJECT', message: apiT(c.req.header('accept-language'), 'apiErrors.staticProjectDelete') } }, 409)
    return c.json({ ok: true })
  })

  app.get('/api/v1/projects/:slug/members', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    return c.json({ members: await getAuthStore(c).listProjectMembers(project.id) })
  })

  app.post('/api/v1/projects/:slug/members', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if (!await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.memberAdminForbidden') } }, 403)
    const body = await c.req.json().catch(() => null) as { email?: string; accountId?: string; role?: string } | null
    const account = body?.accountId ? await getAuthStore(c).getAccount(body.accountId) : body?.email ? await getAuthStore(c).findAccountByEmail(body.email.toLowerCase()) : null
    if (!account) return c.json({ error: { code: 'ACCOUNT_NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.accountLookupFailed') } }, 404)
    const role = body?.role as Exclude<ProjectMemberRole, 'owner'>
    if (!['admin', 'editor', 'reviewer', 'member'].includes(role)) return c.json({ error: { code: 'INVALID_ROLE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidProjectRole') } }, 400)
    await getAuthStore(c).setProjectMember(project.id, account.id, role)
    return c.json({ members: await getAuthStore(c).listProjectMembers(project.id) }, 201)
  })

  app.patch('/api/v1/projects/:slug/members/:accountId', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if (!await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.memberAdminForbidden') } }, 403)
    const body = await c.req.json().catch(() => null) as { role?: string } | null
    const role = body?.role as Exclude<ProjectMemberRole, 'owner'>
    if (!['admin', 'editor', 'reviewer', 'member'].includes(role)) return c.json({ error: { code: 'INVALID_ROLE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidProjectRole') } }, 400)
    await getAuthStore(c).setProjectMember(project.id, c.req.param('accountId'), role)
    return c.json({ members: await getAuthStore(c).listProjectMembers(project.id) })
  })

  app.delete('/api/v1/projects/:slug/members/:accountId', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if (!await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.memberAdminForbidden') } }, 403)
    if (project.ownerId === c.req.param('accountId')) return c.json({ error: { code: 'OWNER_REQUIRED', message: apiT(c.req.header('accept-language'), 'apiErrors.ownerCannotRemove') } }, 409)
    await getAuthStore(c).removeProjectMember(project.id, c.req.param('accountId'))
    return c.json({ ok: true })
  })

  app.post('/api/v1/projects/:slug/invitations', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    const inviter = await getCurrentAccount(c)
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if (!inviter || !await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.invitationForbidden') } }, 403)
    const body = await c.req.json().catch(() => null) as { email?: string; role?: string } | null
    const email = body?.email?.trim().toLowerCase()
    const role = body?.role as Exclude<ProjectMemberRole, 'owner'>
    if (!email || !email.includes('@')) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidEmail') } }, 400)
    if (!['admin', 'editor', 'reviewer', 'member'].includes(role)) return c.json({ error: { code: 'INVALID_ROLE', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidProjectRole') } }, 400)
    const invitee = await getAuthStore(c).findAccountByEmail(email)
    const invitation = { id: crypto.randomUUID(), projectId: project.id, projectSlug: project.slug, inviterId: inviter.id, inviteeId: invitee?.id ?? null, email, role, status: 'pending' as const, createdAt: new Date().toISOString() }
    await getAuthStore(c).createInvitation(invitation)
    if (invitee) await getAuthStore(c).createNotification({ id: crypto.randomUUID(), accountId: invitee.id, type: 'project_invitation', title: apiT(c.req.header('accept-language'), 'notifications.invitationTitle', { project: project.title }), body: apiT(c.req.header('accept-language'), 'notifications.invitationBody', { email: inviter.email, role: apiT(c.req.header('accept-language'), `roles.${role}`) }), data: { invitationId: invitation.id, projectSlug: project.slug }, readAt: null, createdAt: invitation.createdAt })
    return c.json({ invitation }, 201)
  })

  app.get('/api/v1/account/invitations', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    return c.json({ invitations: await getAuthStore(c).listInvitations(account.id, account.email) })
  })

  app.patch('/api/v1/account/invitations/:id', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const body = await c.req.json().catch(() => null) as { status?: string } | null
    if (body?.status !== 'accepted' && body?.status !== 'declined') return c.json({ error: { code: 'INVALID_STATUS', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidInvitationStatus') } }, 400)
    const changed = await getAuthStore(c).respondInvitation(c.req.param('id'), account.id, body.status)
    if (!changed) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.invitationNotFound') } }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/v1/account/notifications', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    return c.json({ notifications: await getAuthStore(c).listNotifications(account.id) })
  })

  app.patch('/api/v1/account/notifications/:id/read', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const changed = await getAuthStore(c).markNotificationRead(account.id, c.req.param('id'))
    if (!changed) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.notificationNotFound') } }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/v1/account/favorites', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const catalog = await getVisibleCatalogFor(c)
    const records = await getAuthStore(c).listProjectFavorites(account.id)
    const projects = await enrichProjects(c, records.map((record) => catalog.projects.find((project) => project.slug === record.projectSlug)).filter((project): project is Project => Boolean(project)))
    return c.json({ favorites: records, projects })
  })

  app.get('/api/v1/projects/:slug/favorite', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ favorite: false, count: 0 })
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    const engagement = await getAuthStore(c).getProjectEngagement(project.slug)
    return c.json({ favorite: await getAuthStore(c).isProjectFavorite(account.id, project.slug), count: (project.followers ?? 0) + engagement.favorites })
  })

  app.put('/api/v1/projects/:slug/favorite', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    await getAuthStore(c).setProjectFavorite(account.id, project.slug, true)
    const engagement = await getAuthStore(c).getProjectEngagement(project.slug)
    return c.json({ favorite: true, count: (project.followers ?? 0) + engagement.favorites })
  })

  app.delete('/api/v1/projects/:slug/favorite', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    await getAuthStore(c).setProjectFavorite(account.id, project.slug, false)
    const engagement = await getAuthStore(c).getProjectEngagement(project.slug)
    return c.json({ favorite: false, count: (project.followers ?? 0) + engagement.favorites })
  })

  app.get('/api/v1/admin/storage/sync', async (c) => {
    const administrator = await requireAdmin(c)
    if (!administrator) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const key = c.req.query('key')
    if (!key || key.length > 500) return c.json({ error: { code: 'INVALID_STORAGE_KEY', message: '请提供要查询的存储对象 key' } }, 400)
    return c.json({ status: await readStorageSyncStatus(c, key) })
  })

  app.post('/api/v1/admin/storage/sync', async (c) => {
    const administrator = await requireAdmin(c)
    if (!administrator) return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
    const body = await c.req.json().catch(() => null) as { key?: string; keys?: string[]; projectSlug?: string; force?: boolean; providerIds?: string[] } | null
    const keys = new Set<string>()
    if (typeof body?.key === 'string' && body.key.trim()) keys.add(body.key.trim())
    for (const item of Array.isArray(body?.keys) ? body.keys : []) if (typeof item === 'string' && item.trim()) keys.add(item.trim())
    if (body?.projectSlug) {
      const project = (await getCatalogFor(c)).projects.find((item) => item.slug === body.projectSlug)
      if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
      for (const file of project.versions.flatMap((version) => version.files)) for (const source of file.sources) {
        const managedKey = await storageKeyFromUrl(c, source.url)
        if (managedKey) keys.add(managedKey)
      }
    }
    if (!keys.size || keys.size > 1_000 || [...keys].some((item) => item.length > 500)) return c.json({ error: { code: 'INVALID_STORAGE_KEY', message: '请提供 1 到 1000 个有效的存储对象 key 或项目' } }, 400)
    const storage = await getStorage(c)
    if (!(storage instanceof StoragePool)) return c.json({ error: { code: 'STORAGE_SYNC_UNAVAILABLE', message: '当前存储配置没有可同步的镜像' } }, 409)
    const results: Array<{ key: string; results: StorageSyncResult[] }> = []
    for (const item of keys) {
      const syncResults = await storage.sync(item, body?.providerIds)
      await writeStorageSyncStatus(c, item, syncResults)
      results.push({ key: item, results: syncResults })
    }
    return c.json({ ok: true, force: body?.force === true, results })
  })

  app.get('/api/v1/storage/:id{.+}', async (c) => {
    const storage = await getStorage(c)
    if (!storage) return c.json({ error: { code: 'STORAGE_UNAVAILABLE', message: apiT(c.req.header('accept-language'), 'apiErrors.storageNotConfigured') } }, 503)
    const primaryCanRedirect = storage instanceof StoragePool ? Boolean(storage.providers.find((provider) => provider.primary)?.adapter.getRedirectUrl) : Boolean(storage.getRedirectUrl)
    if (storage.getRedirectUrl && primaryCanRedirect) {
      try { return c.redirect(await storage.getRedirectUrl(c.req.param('id'), 300), 302) } catch { /* fall through to a mirror byte read */ }
    }
    const object = await storage.get(c.req.param('id'))
    if (!object) return c.json({ error: { code: 'NOT_FOUND', message: apiT(c.req.header('accept-language'), 'apiErrors.fileNotFound') } }, 404)
    c.header('Content-Type', object.contentType)
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
    if (object.filename) c.header('Content-Disposition', `inline; filename="${object.filename.replaceAll('"', '')}"`)
    return c.body(object.body as any)
  })

  app.post('/api/v1/storage/direct-uploads', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const settings = await getSiteSettings(c)
    if (!settings.storage.directUpload.enabled || !settings.storage.directUpload.roles.includes(account.role)) return c.json({ error: { code: 'DIRECT_UPLOAD_UNAVAILABLE', message: 'Direct uploads are not enabled for this account' } }, 403)
    const storage = await getStorage(c)
    const uploadAdapter = storage instanceof StoragePool ? storage.primary : storage
    if (!uploadAdapter?.createUploadUrl) return c.json({ error: { code: 'DIRECT_UPLOAD_UNAVAILABLE', message: 'The primary storage does not support direct uploads. Select a configured Tencent COS provider as primary; R2 binding and local disk do not provide signed upload URLs.' } }, 409)
    const body = await c.req.json().catch(() => null) as { filename?: string; size?: number; contentType?: string; purpose?: string; projectSlug?: string } | null
    const purpose = body?.purpose === 'project-file' ? 'project-file' : 'account'
    const filename = String(body?.filename || '').trim().slice(0, 255)
    const size = Number(body?.size)
    if (!filename || !Number.isSafeInteger(size) || size < 0 || size > Math.min(512 * 1024 * 1024, settings.moderation.automatic.maxFileSize)) return c.json({ error: { code: 'FILE_TOO_LARGE', message: apiT(c.req.header('accept-language'), 'apiErrors.fileTooLarge') } }, 413)
    let projectSlug: string | null = null
    if (purpose === 'project-file') {
      projectSlug = String(body?.projectSlug || '').trim()
      const project = (await getCatalogFor(c)).projects.find((item) => item.slug === projectSlug)
      if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
      if (!await canManageProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.fileUploadForbidden') } }, 403)
    }
    const id = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + settings.storage.directUpload.ttlSeconds * 1000).toISOString()
    const contentType = String(body?.contentType || 'application/octet-stream').slice(0, 200)
    const storageKey = `direct/${id}`
    let uploadUrl: string
    try { uploadUrl = await uploadAdapter.createUploadUrl(storageKey, contentType, filename, settings.storage.directUpload.ttlSeconds) } catch { return c.json({ error: { code: 'DIRECT_UPLOAD_SIGNING_FAILED', message: 'Failed to sign the upload URL. Check the primary storage credentials and endpoint.' } }, 502) }
    await getAuthStore(c).setAppSetting(`direct_upload:${id}`, JSON.stringify({ id, accountId: account.id, filename, size, contentType, purpose, projectSlug, storageKey, expiresAt }))
    const origin = new URL(c.env?.PUBLIC_BASE_URL || c.req.url).origin
    return c.json({ uploadId: id, uploadUrl, method: 'PUT', expiresAt, completeUrl: new URL(`/api/v1/storage/direct-uploads/${id}/complete`, origin).href }, 201)
  })

  app.post('/api/v1/storage/direct-uploads/:id/complete', async (c) => {
    const account = await getCurrentAccount(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    const settings = await getSiteSettings(c)
    if (!settings.storage.directUpload.enabled || !settings.storage.directUpload.roles.includes(account.role)) return c.json({ error: { code: 'DIRECT_UPLOAD_UNAVAILABLE', message: 'Direct uploads are not enabled for this account' } }, 403)
    const raw = await getAuthStore(c).getAppSetting(`direct_upload:${c.req.param('id')}`)
    type DirectUploadSession = { id: string; accountId: string; filename: string; size: number; contentType: string; purpose: 'account' | 'project-file'; projectSlug: string | null; storageKey: string; expiresAt: string }
    let session: DirectUploadSession | null = null
    try { session = raw ? JSON.parse(raw) as DirectUploadSession : null } catch { session = null }
    if (!session || session.accountId !== account.id || Date.parse(session.expiresAt) < Date.now()) return c.json({ error: { code: 'UPLOAD_EXPIRED', message: 'Direct upload session is missing or expired' } }, 404)
    const storage = await getStorage(c)
    if (!storage?.head || !await storage.head(session.storageKey)) return c.json({ error: { code: 'UPLOAD_INCOMPLETE', message: 'The object was not uploaded to storage' } }, 422)
    const url = await storageObjectUrl(c, session.storageKey)
    if (session.purpose === 'project-file') return c.json({ id: session.storageKey, name: session.filename, size: session.size, source: { id: `managed-${session.storageKey}`, kind: 'managed', region: 'GLOBAL', url, priority: 100 } })
    return c.json({ id: session.storageKey, url, name: session.filename, size: session.size })
  })

  app.post('/api/v1/account/uploads', async (c) => {
    const account = await getCurrentAccount(c)
    const storage = await getStorage(c)
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    if (!storage) return c.json({ error: { code: 'STORAGE_UNAVAILABLE', message: apiT(c.req.header('accept-language'), 'apiErrors.storageNotConfigured') } }, 503)
    const form = await c.req.parseBody(); const upload = form.file
    if (!(upload instanceof File)) return c.json({ error: { code: 'INVALID_FILE', message: apiT(c.req.header('accept-language'), 'apiErrors.fileRequired') } }, 400)
    const purpose = typeof form.purpose === 'string' ? form.purpose : ''
    if (purpose === 'skin' && (upload.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(upload.type))) return c.json({ error: { code: 'INVALID_SKIN', message: apiT(c.req.header('accept-language'), 'apiErrors.invalidSkinCapeFile') } }, 413)
    if (upload.size > 20 * 1024 * 1024) return c.json({ error: { code: 'FILE_TOO_LARGE', message: apiT(c.req.header('accept-language'), 'apiErrors.imageTooLarge') } }, 413)
    const id = crypto.randomUUID(); await storage.put(id, await upload.arrayBuffer(), upload.type || 'application/octet-stream', upload.name)
    return c.json({ id, url: await storageObjectUrl(c, id), name: upload.name, size: upload.size }, 201)
  })

  app.get('/api/v1/projects/:slug/site', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.html('<h1>Project not found</h1>', 404)
    await setCatalogCacheControl(c)
    c.header('Content-Security-Policy', "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https:; connect-src https: http:; script-src 'none'")
    c.header('Content-Type', 'text/html; charset=utf-8')
    return c.body(project.homepageHtml ?? `<main style="font-family:system-ui;max-width:760px;margin:48px auto;padding:0 24px"><h1>${project.title}</h1><p>${project.description}</p></main>`)
  })

  app.post('/api/v1/projects/:slug/files', async (c) => {
    const project = (await getCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    const auth = await requireScope(c, 'release:write')
    if (auth.error) return auth.error
    if ((c as any).get('publishProjectSlug') && (c as any).get('publishProjectSlug') !== project.slug) return c.json({ error: { code: 'PROJECT_SCOPE_REQUIRED', message: '发布令牌未绑定此项目' } }, 403)
    if (!await canManageProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: apiT(c.req.header('accept-language'), 'apiErrors.fileUploadForbidden') } }, 403)
    const storage = await getStorage(c)
    if (!storage) return c.json({ error: { code: 'STORAGE_UNAVAILABLE', message: apiT(c.req.header('accept-language'), 'apiErrors.storageNotConfigured') } }, 503)
    const form = await c.req.parseBody()
    const upload = form.file
    if (!(upload instanceof File)) return c.json({ error: { code: 'INVALID_FILE', message: apiT(c.req.header('accept-language'), 'apiErrors.fileRequired') } }, 400)
    const settings = await getSiteSettings(c)
    const extension = upload.name.split('.').pop()?.toLowerCase() ?? ''
    if (upload.size > Math.min(512 * 1024 * 1024, settings.moderation.automatic.maxFileSize)) return c.json({ error: { code: 'FILE_TOO_LARGE', message: apiT(c.req.header('accept-language'), 'apiErrors.fileTooLarge') } }, 413)
    if (settings.moderation.automatic.blockedExtensions.includes(extension)) return c.json({ error: { code: 'FILE_TYPE_BLOCKED', message: apiT(c.req.header('accept-language'), 'apiErrors.extensionBlocked') } }, 415)
    const id = crypto.randomUUID()
    await storage.put(id, await upload.arrayBuffer(), upload.type || 'application/octet-stream', upload.name)
    return c.json({ id, name: upload.name, size: upload.size, source: { id: `managed-${id}`, kind: 'managed', region: 'GLOBAL', url: await storageObjectUrl(c, id), priority: 100 } }, 201)
  })

  app.post('/api/v1/publish/uploads', async (c) => {
    const auth = await requireScope(c, 'release:write')
    if (auth.error) return auth.error
    const projectSlug = c.req.query('project')
    if (!projectSlug || ((c as any).get('publishProjectSlug') && (c as any).get('publishProjectSlug') !== projectSlug)) return c.json({ error: { code: 'PROJECT_SCOPE_REQUIRED', message: '请提供匹配发布令牌的 project 参数' } }, 403)
    const body = await c.req.json().catch(() => null) as { filename?: string; size?: number; sha256?: string; contentType?: string } | null
    if (!body?.filename || !Number.isSafeInteger(body.size) || Number(body.size) < 0 || Number(body.size) > 512 * 1024 * 1024) return c.json({ error: { code: 'INVALID_UPLOAD', message: '文件名和大小不正确' } }, 400)
    const storage = await getStorage(c); if (!storage) return c.json({ error: { code: 'STORAGE_UNAVAILABLE', message: '文件存储未配置' } }, 503)
    const id = crypto.randomUUID(); const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); const contentType = body.contentType || 'application/octet-stream'; const key = `publish/${projectSlug}/${id}/${body.filename}`
    const multipartId = Number(body.size) > 100 * 1024 * 1024 && storage.createMultipart ? await storage.createMultipart(key, contentType, body.filename) : null
    await getAuthStore(c).createPublishUpload({ id, projectSlug, accountId: auth.account!.id, filename: body.filename, size: Number(body.size), sha256: body.sha256 ?? null, contentType, storageKey: key, multipartId, status: 'created', createdAt: new Date().toISOString(), expiresAt })
    const origin = new URL(c.env?.PUBLIC_BASE_URL || c.req.url).origin
    return c.json({ uploadId: id, uploadUrl: new URL(`/api/v1/publish/uploads/${id}`, origin).href, method: 'PUT', expiresAt, partSize: multipartId ? 8 * 1024 * 1024 : null, completeUrl: multipartId ? new URL(`/api/v1/publish/uploads/${id}/complete`, origin).href : null }, 201)
  })

  app.put('/api/v1/publish/uploads/:id', async (c) => {
    const auth = await requireScope(c, 'release:write'); if (auth.error) return auth.error
    const row = await getAuthStore(c).getPublishUpload(c.req.param('id'), auth.account!.id)
    if (!row || row.status !== 'created' || Date.parse(row.expiresAt) < Date.now()) return c.json({ error: { code: 'UPLOAD_EXPIRED', message: '上传会话不存在或已过期' } }, 404)
    const storage = await getStorage(c); if (!storage) return c.json({ error: { code: 'STORAGE_UNAVAILABLE', message: '文件存储未配置' } }, 503)
    const data = await c.req.arrayBuffer(); if (data.byteLength !== Number(row.size)) return c.json({ error: { code: 'SIZE_MISMATCH', message: '文件大小不匹配' } }, 422)
    if (row.multipartId) return c.json({ error: { code: 'MULTIPART_REQUIRED', message: '此会话需要分片上传' } }, 409)
    await storage.put(row.storageKey!, data, row.contentType, row.filename)
    await getAuthStore(c).completePublishUpload(row.id)
    return c.json({ uploadId: row.id, status: 'complete', storageKey: row.storageKey })
  })

  app.put('/api/v1/publish/uploads/:id/parts/:part', async (c) => {
    const auth = await requireScope(c, 'release:write'); if (auth.error) return auth.error
    const row = await getAuthStore(c).getPublishUpload(c.req.param('id'), auth.account!.id)
    const storage = await getStorage(c); const part = Number(c.req.param('part'))
    if (!row || row.status !== 'created' || !row.multipartId || !storage?.uploadPart || !Number.isInteger(part) || part < 1 || part > 10000) return c.json({ error: { code: 'INVALID_PART', message: '分片上传会话或分片编号无效' } }, 400)
    const etag = await storage.uploadPart(row.storageKey!, row.multipartId, part, await c.req.arrayBuffer())
    return c.json({ part, etag })
  })

  app.post('/api/v1/publish/uploads/:id/complete', async (c) => {
    const auth = await requireScope(c, 'release:write'); if (auth.error) return auth.error
    const row = await getAuthStore(c).getPublishUpload(c.req.param('id'), auth.account!.id)
    const storage = await getStorage(c); const body = await c.req.json().catch(() => null) as { parts?: Array<{ partNumber?: number; etag?: string }> } | null
    if (!row || row.status !== 'created' || !row.multipartId || !storage?.completeMultipart || !body?.parts?.length) return c.json({ error: { code: 'INVALID_MULTIPART', message: '分片上传会话或分片列表无效' } }, 400)
    await storage.completeMultipart(row.storageKey!, row.multipartId, body.parts.map((part) => ({ partNumber: Number(part.partNumber), etag: String(part.etag) })))
    await getAuthStore(c).completePublishUpload(row.id)
    return c.json({ uploadId: row.id, status: 'complete', storageKey: row.storageKey })
  })

  app.post('/api/v1/projects/:slug/publish', async (c) => {
    const auth = await requireScope(c, 'release:write')
    if (auth.error) return auth.error
    const catalog = await getCatalogFor(c)
    const current = catalog.projects.find((item) => item.slug === c.req.param('slug'))
    if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    if ((c as any).get('publishProjectSlug') && (c as any).get('publishProjectSlug') !== current.slug) return c.json({ error: { code: 'PROJECT_SCOPE_REQUIRED', message: '发布令牌未绑定此项目' } }, 403)
    if (!await canManageProject(c, current)) return c.json({ error: { code: 'FORBIDDEN', message: '没有项目发布权限' } }, 403)
    if (!await getAuthStore(c).getStoredProject(current.slug)) return c.json({ error: { code: 'STATIC_PROJECT', message: '静态项目必须通过 GitHub Catalog 发布' } }, 409)
    const body = await c.req.json().catch(() => null) as { version?: any; replace?: boolean } | null
    const rawVersion = body?.version && typeof body.version === 'object' ? { ...body.version, files: Array.isArray(body.version.files) ? await Promise.all(body.version.files.map(async (raw: any) => {
      if (!raw?.uploadId) return raw
      const upload = await getAuthStore(c).getCompletedPublishUpload(raw.uploadId, auth.account!.id, current.slug)
      if (!upload) return { ...raw, sources: [] }
      const managed = { id: `managed-${upload.id}`, kind: 'managed', region: 'GLOBAL', url: await storageObjectUrl(c, upload.storageKey!), priority: 50 }
      return { ...raw, id: raw.id || `publish-${upload.id}`, name: raw.filename || upload.filename, size: Number(upload.size), sources: [...(Array.isArray(raw.sources) ? raw.sources : []), managed] }
    })) : [] } : body?.version
    const parsed = versionSchema.safeParse(rawVersion)
    if (!parsed.success) return c.json({ error: { code: 'INVALID_VERSION', message: '版本数据格式不正确', details: parsed.error.flatten() } }, 400)
    const version = parsed.data
    for (const file of version.files) for (const source of file.sources) {
      if (source.kind !== 'github_release') continue
      const host = new URL(source.url).hostname.toLowerCase()
      if (!['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(host)) return c.json({ error: { code: 'INVALID_GITHUB_SOURCE', message: 'GitHub Release 源必须来自 GitHub 官方域名' } }, 400)
    }
    const duplicate = current.versions.find((item) => item.id === version.id)
    if (duplicate && !body?.replace) return c.json({ error: { code: 'VERSION_EXISTS', message: '该版本已经存在' } }, 409)
    const dependencyErrors = validateDependencies({ ...current, versions: [...current.versions.filter((item) => item.id !== version.id), version] }, await getVisibleCatalogFor(c))
    if (dependencyErrors.length) return c.json({ error: { code: 'INVALID_DEPENDENCIES', message: dependencyErrors.join('; ') } }, 400)
    const requiresReview = auth.account?.role === 'developer' && (await getSiteSettings(c)).moderation.projectCreation !== 'none'
    const reviewedVersion = requiresReview ? { ...version, status: 'draft' as const, files: version.files.map((file) => ({ ...file, reviewStatus: 'pending' as const })) } : version
    const project = { ...current, versions: [...current.versions.filter((item) => item.id !== version.id), reviewedVersion] }
    await getAuthStore(c).saveStoredProject(project)
    return c.json({ releaseId: crypto.randomUUID(), project: project.slug, versionId: reviewedVersion.id, status: requiresReview ? 'pending_review' : 'published', version: reviewedVersion }, duplicate ? 200 : 201)
  })

  app.get('/api/v1/projects/:slug/publish-tokens', async (c) => {
    const auth = await requireScope(c, 'project:write')
    if (auth.error) return auth.error
    const project = (await getCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project || !await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: '没有管理发布令牌权限' } }, 403)
    return c.json({ tokens: await getAuthStore(c).listProjectPublishTokens(project.slug) })
  })

  app.post('/api/v1/projects/:slug/publish-tokens', async (c) => {
    const auth = await requireScope(c, 'project:write')
    if (auth.error) return auth.error
    const project = (await getCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project || !await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: '没有创建发布令牌权限' } }, 403)
    const body = await c.req.json().catch(() => null) as { name?: string; scopes?: unknown } | null
    const name = body?.name?.trim()
    if (!name || name.length > 80) return c.json({ error: { code: 'INVALID_INPUT', message: '令牌名称不能为空且不能超过 80 个字符' } }, 400)
    const allowed = new Set(['project:read', 'release:write', 'release:publish'])
    const scopes = Array.isArray(body?.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === 'string' && allowed.has(scope)) : ['release:write']
    const bytes = crypto.getRandomValues(new Uint8Array(32)); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
    const token = `lpt_${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`
    const record = { id: crypto.randomUUID(), projectSlug: project.slug, accountId: auth.account!.id, tokenHash: await hashApiKey(token), name, scopes: scopes.length ? scopes : ['release:write'], createdAt: new Date().toISOString(), revokedAt: null }
    await getAuthStore(c).createProjectPublishToken(record)
    const { tokenHash: _hash, accountId: _account, ...summary } = record
    return c.json({ token, tokenInfo: summary }, 201)
  })

  app.delete('/api/v1/projects/:slug/publish-tokens/:id', async (c) => {
    const auth = await requireScope(c, 'project:write')
    if (auth.error) return auth.error
    const project = (await getCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project || !await canAdminProject(c, project)) return c.json({ error: { code: 'FORBIDDEN', message: '没有吊销发布令牌权限' } }, 403)
    if (!await getAuthStore(c).revokeProjectPublishToken(project.slug, c.req.param('id'))) return c.json({ error: { code: 'NOT_FOUND', message: '发布令牌不存在或已经吊销' } }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/v1/catalog', async (c) => {
    const catalog = await getVisibleCatalogFor(c)
    await setCatalogCacheControl(c)
    c.header('X-Catalog-Revision', catalog.catalogRevision)
    return c.json(catalog)
  })

  app.get('/api/v1/dependencies/external', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const ref = externalDependencySchema.safeParse({ provider: c.req.query('provider'), projectId: c.req.query('projectId'), versionId: c.req.query('versionId') || undefined })
    const loader = c.req.query('loader'); const gameVersion = c.req.query('gameVersion')
    if (!ref.success || !loader || !gameVersion || loader.length > 100 || gameVersion.length > 100) return c.json({ error: { code: 'INVALID_REFERENCE', message: 'Provider, project ID, loader and game version are required' } }, 400)
    try {
      const remote = await externalProviderClient(c.env, options.externalFetch).load(ref.data, { loader, gameVersion })
      return c.json({ reference: remote.reference, title: remote.project.title, versions: remote.project.versions.filter(v => v.loaders.includes(loader) && v.gameVersions.includes(gameVersion) && ['listed', 'unlisted'].includes(v.status)).map(v => ({ id: v.id.split(':').at(-1), version: v.version })) })
    } catch (e) { return c.json({ error: { code: e instanceof ExternalProviderError ? e.code : 'EXTERNAL_METADATA', message: e instanceof ExternalProviderError ? e.message : 'Provider returned unsupported metadata' } }, 502) }
  })

  app.post('/api/v1/dependencies/preview', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const account = await getCurrentAccount(c)
    if (!account || !canPublishAccount(account)) return c.json({ error: { code: 'FORBIDDEN', message: 'Publisher login required' } }, 403)
    const body = await c.req.json().catch(() => null)
    const project = projectSchema.safeParse(body?.project); const input = dependencyRequestSchema.safeParse(body?.input)
    if (!project.success || !input.success) return c.json({ error: { code: 'INVALID_DEPENDENCIES', message: 'Invalid preview project or environment' } }, 400)
    const catalog = await getVisibleCatalogFor(c)
    const errors = validateDependencies(project.data, catalog)
    if (errors.length) return c.json({ error: { code: 'INVALID_DEPENDENCIES', message: errors.join('; ') } }, 400)
    catalog.projects = [...catalog.projects.filter(p => p.id !== project.data.id), project.data]
    return c.json(await resolveWithExternal(catalog, input.data, c.env, options.externalFetch))
  })

  app.post('/api/v1/dependencies/resolve', async (c) => {
    const input = dependencyRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!input.success) return c.json({ error: { code: 'INVALID_DEPENDENCIES', message: 'Invalid resolution request', details: input.error.flatten() } }, 400)
    c.header('Cache-Control', 'private, no-store')
    return c.json(await resolveWithExternal(await getVisibleCatalogFor(c), input.data, c.env, options.externalFetch))
  })
  app.get('/api/v1/projects/:slug/versions/:versionId/dependencies', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find(p => p.slug === c.req.param('slug'))
    const version = project?.versions.find(v => v.id === c.req.param('versionId'))
    if (!version) return c.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, 404)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ dependencies: version.dependencies, loaderBridges: version.loaderBridges || [], loaders: version.loaders, gameVersions: version.gameVersions })
  })
  app.get('/api/v1/projects/:slug/dependents', async (c) => {
    const catalog = await getVisibleCatalogFor(c)
    const target = catalog.projects.find(p => p.slug === c.req.param('slug'))
    if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    const ids = new Set(target.versions.map(v => v.id))
    c.header('Cache-Control', 'private, no-store')
    return c.json({ dependents: catalog.projects.flatMap(p => p.versions.flatMap(v => [...v.dependencies, ...(v.loaderBridges || []).map(b => ({ projectId: b.viaProjectId, versionId: b.viaVersionId, dependencyType: 'required' as const, reason: `${b.fromLoader} → ${b.toLoader}` }))].filter(d => d.projectId === target.id || Boolean(d.versionId && ids.has(d.versionId))).map(d => ({ projectId: p.id, slug: p.slug, title: p.title, versionId: v.id, version: v.version, dependency: d })))) })
  })

  app.get('/api/v1/projects', async (c) => {
    const catalog = await getVisibleCatalogFor(c)
    await setCatalogCacheControl(c)
    const query = c.req.query('query')?.trim().toLowerCase()
    const type = c.req.query('type')
    const loaders = c.req.queries('loader') ?? []
    const gameVersions = c.req.queries('game_version') ?? []
    const categories = c.req.queries('category') ?? []
    const clientSide = c.req.query('client_side')
    const serverSide = c.req.query('server_side')
    const status = c.req.query('status')
    const projects = catalog.projects.filter((project) => {
      if (query && !`${project.id} ${project.title} ${project.slug} ${project.description}`.toLowerCase().includes(query)) return false
      if (type && project.type !== type) return false
      if (loaders.length && !loaders.every((loader) => project.loaders.includes(loader))) return false
      if (gameVersions.length && !gameVersions.some((gameVersion) => project.gameVersions.includes(gameVersion))) return false
      if (categories.length && !categories.some((category) => project.categories.includes(category))) return false
      if (clientSide && project.clientSide !== clientSide) return false
      if (serverSide && project.serverSide !== serverSide) return false
      if (status && project.status !== status) return false
      return true
    })
    const enriched = await enrichProjects(c, projects)
    const sort = c.req.query('sort') ?? 'relevance'
    const sorted = [...enriched].sort((a, b) => sort === 'downloads' ? b.downloads - a.downloads : sort === 'followers' ? b.followers - a.followers : sort === 'updated' ? (b.versions[0]?.publishedAt ?? '').localeCompare(a.versions[0]?.publishedAt ?? '') : Number(b.featured) - Number(a.featured))
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0)); const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)))
    setEngagementCacheControl(c)
    return c.json({ projects: await enrichProjects(c, sorted.slice(offset, offset + limit)), total: sorted.length, offset, limit, catalogRevision: catalog.catalogRevision })
  })

  app.get('/api/v1/projects/:slug', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    setEngagementCacheControl(c)
    return c.json(await enrichProject(c, project))
  })

  app.get('/api/v1/projects/:slug/versions', async (c) => {
    const project = (await getVisibleCatalogFor(c)).projects.find((item) => item.slug === c.req.param('slug'))
    if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
    await setCatalogCacheControl(c)
    return c.json({ versions: project.versions })
  })

  registerDownloads(app, (c) => getVisibleCatalogFor(c), async (c, event) => {
    const account = await getCurrentAccount(c)
    await getAuthStore(c).recordDownload({ ...event, id: crypto.randomUUID(), accountId: account?.id ?? null, createdAt: new Date().toISOString() })
  })
  registerYgg(app, (c) => getAuthStore(c), (c) => getJwtSecret(c), (c) => getSiteSettings(c))
  registerMojang(app, (c) => getAuthStore(c), (c) => getCurrentAccount(c), (c) => getSiteSettings(c))
  registerModrinthCompat(app, (c) => getVisibleCatalogFor(c), '/v2')
  registerModrinthCompat(app, (c) => getVisibleCatalogFor(c), '/api/modrinth/v2')

  return app
}

export type App = ReturnType<typeof createApp>

