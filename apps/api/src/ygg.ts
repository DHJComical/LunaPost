import type { Hono } from 'hono'
import { createJwt, hashSessionId, verifyJwt, verifyPassword, type AccountStore } from './auth.js'

const normalizeUuid = (value: string) => value.replaceAll('-', '').toLowerCase()
const uuidForAccount = async (id: string) => {
  const bytes = new TextEncoder().encode(`andrea-modpost:ygg:${id}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
const profileName = (account: any) => account.metadata?.username || account.email.split('@')[0]
const base64Utf8 = (value: string) => { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary) }
const profile = async (account: any, sign?: (value: string) => Promise<string | null>) => { const id = normalizeUuid(account.metadata?.minecraftUuid || await uuidForAccount(account.id)); const name = profileName(account); if (!account.metadata?.skinUrl && !account.metadata?.capeUrl) return { id, name, properties: [] }; const value = base64Utf8(JSON.stringify({ timestamp: Date.now(), profileId: id, profileName: name, textures: { ...(account.metadata?.skinUrl ? { SKIN: { url: account.metadata.skinUrl } } : {}), ...(account.metadata?.capeUrl ? { CAPE: { url: account.metadata.capeUrl } } : {}) } })); const property: { name: string; value: string; signature?: string } = { name: 'textures', value }; const signature = await sign?.(value); if (signature) property.signature = signature; return { id, name, properties: [property] } }
const error = (c: any, status: 400 | 401 | 403 | 404 | 429, message: string) => c.json({ error: 'ForbiddenOperationException', errorMessage: message, cause: '' }, status)

type YggUpstream = { id?: string; name?: string; baseUrl?: string; authBaseUrl?: string; sessionBaseUrl?: string; profileBaseUrl?: string; nameLookupBaseUrl?: string; enabled?: boolean; priority?: number }
type FederatedIdentity = { upstreamId: string; accessToken: string; clientToken?: string; profile?: { id?: string; name?: string } }

const enabledUpstreams = (settings: any) => [...((settings?.ygg?.upstreams ?? []) as YggUpstream[])]
  .filter((item) => item.enabled !== false && (item.baseUrl || item.authBaseUrl || item.sessionBaseUrl || item.profileBaseUrl || item.nameLookupBaseUrl))
  .sort((left, right) => Number(left.priority ?? 0) - Number(right.priority ?? 0))

const upstreamBase = (upstream: YggUpstream, field: keyof YggUpstream) => String(upstream[field] || upstream.baseUrl || '').replace(/\/+$/u, '')
const upstreamUrl = (upstream: YggUpstream, field: keyof YggUpstream, path: string) => `${upstreamBase(upstream, field)}/${path.replace(/^\/+/, '')}`
const upstreamId = (upstream: YggUpstream, index = 0) => String(upstream.id || `upstream-${index + 1}`)

const readJsonResponse = async (response: Response): Promise<{ response: Response; payload: any }> => {
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

export function registerYgg(app: Hono<any>, getStore: (c: any) => AccountStore, getSecret: (c: any) => string, getSettings?: (c: any) => Promise<any>) {
  const getTextureSigner = (c: any) => { const configured = c.env?.YGG_TEXTURE_PRIVATE_KEY as string | undefined; const pem = configured?.replaceAll('\\n', '\n'); if (!pem) return undefined; return async (value: string) => { try { const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/gu, ''); const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0)); const key = await crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign']); const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(value)); let output = ''; for (const byte of new Uint8Array(signature)) output += String.fromCharCode(byte); return btoa(output) } catch { return null } } }
  const getProfile = (c: any, account: any, unsigned = false) => profile(account, unsigned ? undefined : getTextureSigner(c))
  const tokenHash = (token: string) => hashSessionId(token)
  const isRevoked = async (store: AccountStore, token?: string) => !token || await store.isYggTokenRevoked(await tokenHash(token))
  const revoke = async (store: AccountStore, token?: string) => { if (token) await store.revokeYggToken(await tokenHash(token), null, new Date().toISOString(), null) }
  const rate = new Map<string, { count: number; reset: number }>()
  const allowed = (key: string, max = 30, windowMs = 60_000) => { const now = Date.now(); const previous = rate.get(key); if (!previous || previous.reset <= now) { rate.set(key, { count: 1, reset: now + windowMs }); return true } if (previous.count >= max) return false; previous.count += 1; return true }
  const requestKey = (c: any) => c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const settingsFor = async (c: any) => await getSettings?.(c) ?? { ygg: { enabled: true, allowLocalAccounts: true, accessTokenTtlSeconds: 3600, refreshTokenTtlSeconds: 2592000, upstreams: [] } }
  const upstreamProfile = async (c: any, uuid: string) => {
    const upstreams = enabledUpstreams(await settingsFor(c))
    for (const upstream of upstreams) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 4_000)
      try {
        const response = await fetch(upstreamUrl(upstream, 'profileBaseUrl', `sessionserver/session/minecraft/profile/${normalizeUuid(uuid)}`), { signal: controller.signal, headers: { Accept: 'application/json' } })
        if (response.ok) return await response.json()
      } catch { /* try the next mirror */ } finally { clearTimeout(timeout) }
    }
    return null
  }
  const upstreamProfilesByName = async (c: any, names: string[]): Promise<any[]> => {
    const upstreams = enabledUpstreams(await settingsFor(c))
    const result: any[] = []
    let remaining = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    for (const upstream of upstreams) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 4_000)
      try {
        let response = await fetch(upstreamUrl(upstream, 'nameLookupBaseUrl', 'api/profiles/minecraft'), { method: 'POST', signal: controller.signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(remaining) })
        if (!response.ok) response = await fetch(upstreamUrl(upstream, 'nameLookupBaseUrl', 'profiles/minecraft'), { method: 'POST', signal: controller.signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(remaining) })
        if (response.ok) {
          const payload = await response.json() as unknown
          if (Array.isArray(payload)) {
            for (const item of payload) if (item && typeof item.name === 'string' && !result.some((known) => known.name?.toLowerCase() === item.name.toLowerCase())) result.push(item)
            remaining = remaining.filter((name) => !result.some((item) => item.name?.toLowerCase() === name.toLowerCase()))
            if (!remaining.length) break
          }
        }
      } catch { /* try the next mirror */ } finally { clearTimeout(timeout) }
    }
    return result
  }
  const findByName = async (store: AccountStore, name: string) => {
    const accounts = await store.listAccounts()
    for (const item of accounts) { const account = await store.getAccount(item.id); if (account && profileName(account).toLowerCase() === name.toLowerCase()) return account }
    return null
  }
  const findByUuid = async (store: AccountStore, uuid: string) => {
    const wanted = normalizeUuid(uuid); const accounts = await store.listAccounts()
    for (const item of accounts) { const account = await store.getAccount(item.id); if (account && normalizeUuid(account.metadata?.minecraftUuid || await uuidForAccount(account.id)) === wanted) return account }
    return null
  }
  const upstreamById = async (c: any, id: string) => enabledUpstreams(await settingsFor(c)).find((item, index) => upstreamId(item, index) === id) ?? null
  const federated = (identity: any): FederatedIdentity | null => {
    const value = identity?.ygg
    if (!value || typeof value !== 'object' || typeof value.upstreamId !== 'string' || typeof value.accessToken !== 'string') return null
    return value as FederatedIdentity
  }
  const makeFederatedToken = async (c: any, upstream: YggUpstream, upstreamResponse: any, fallbackClientToken?: string) => {
    const selected = upstreamResponse?.selectedProfile ?? upstreamResponse?.availableProfiles?.[0]
    const profileId = typeof selected?.id === 'string' ? normalizeUuid(selected.id) : crypto.randomUUID().replaceAll('-', '')
    const name = typeof selected?.name === 'string' ? selected.name : 'player'
    const id = upstreamId(upstream)
    return createJwt({
      sub: `ygg:${id}:${profileId}`,
      email: `${name.toLowerCase()}@${id}.ygg`,
      role: 'user',
      ygg: { upstreamId: id, accessToken: String(upstreamResponse?.accessToken || ''), clientToken: String(upstreamResponse?.clientToken || fallbackClientToken || ''), profile: { id: profileId, name } },
    }, getSecret(c), Number((await settingsFor(c)).ygg?.accessTokenTtlSeconds ?? 3600))
  }
  const forwardAuth = async (c: any, upstream: YggUpstream, path: string, body: unknown) => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      return await readJsonResponse(await fetch(upstreamUrl(upstream, 'authBaseUrl', path), { method: 'POST', signal: controller.signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
    } catch {
      return { response: null, payload: null }
    } finally { clearTimeout(timeout) }
  }
  const forwardSession = async (upstream: YggUpstream, path: string, body?: unknown, query?: string) => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      const url = `${upstreamUrl(upstream, 'sessionBaseUrl', path)}${query ? `?${query}` : ''}`
      return await readJsonResponse(await fetch(url, { method: body === undefined ? 'GET' : 'POST', signal: controller.signal, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
    } catch {
      return { response: null, payload: null }
    } finally { clearTimeout(timeout) }
  }
  app.get('/api/ygg/meta', async (c) => {
    if (!(await settingsFor(c)).ygg?.enabled) return error(c, 403, 'Ygg service disabled')
    const origin = new URL(c.req.url).origin
    return c.json({ meta: { implementationName: 'Andrea Modpost Yggdrasil', implementationVersion: '0.2.0', serverName: 'Andrea Modpost', feature: { noProfileKey: true, legacySkinDomains: [] } }, skinDomains: [], signaturePublickey: c.env?.YGG_TEXTURE_PUBLIC_KEY || null, services: { authserver: `${origin}/api/ygg/authserver`, sessionserver: `${origin}/api/ygg/sessionserver`, profileserver: `${origin}/api/ygg/api` } }, 200, { 'Cache-Control': 'no-store' })
  })
  const serverConfig = async (c: any) => {
    if (!(await settingsFor(c)).ygg?.enabled) return error(c, 403, 'Ygg service disabled')
    const origin = new URL(c.req.url).origin
    const metadataUrl = `${origin}/api/ygg/meta`
    return c.json({ metadataUrl, authlibInjector: { metadataUrl, javaAgent: `-javaagent:authlib-injector.jar=${metadataUrl}` }, serverProperties: { 'online-mode': 'true', 'prevent-proxy-connections': 'false' }, forwarding: { mode: 'federated', localAccounts: Boolean((await settingsFor(c)).ygg?.allowLocalAccounts), upstreams: enabledUpstreams(await settingsFor(c)).map((item, index) => ({ id: upstreamId(item, index), name: item.name || upstreamId(item, index), priority: Number(item.priority ?? 0) })) } }, 200, { 'Cache-Control': 'no-store' })
  }
  app.get('/api/ygg/server-config', serverConfig)
  app.get('/api/ygg/config', serverConfig)
  app.get('/api/ygg/server', serverConfig)
  app.post('/api/ygg/authserver/authenticate', async (c) => {
    if (!allowed(`auth:${requestKey(c)}`, 10)) return error(c, 429, 'Too many authentication attempts')
    if (!(await settingsFor(c)).ygg?.enabled) return error(c, 403, 'Ygg service disabled')
    const body = await c.req.json().catch(() => null) as { username?: string; password?: string; clientToken?: string; requestUser?: boolean } | null
    if (!body?.username || !body.password) return error(c, 400, 'Invalid credentials')
    const settings = await settingsFor(c); const store = getStore(c); const account = settings.ygg?.allowLocalAccounts === false ? null : (await store.findAccountByEmail(body.username.toLowerCase())) ?? await findByName(store, body.username)
    if (account && await verifyPassword(body.password, account.passwordHash)) {
      const selected = await getProfile(c, account); const clientToken = body.clientToken || crypto.randomUUID(); const accessToken = await createJwt({ sub: account.id, email: account.email, role: account.role }, getSecret(c), Number(settings.ygg?.accessTokenTtlSeconds ?? 3600))
      return c.json({ accessToken, clientToken, availableProfiles: [selected], selectedProfile: selected, user: body.requestUser === false ? undefined : { id: account.id, properties: [] } })
    }
    for (const upstream of enabledUpstreams(settings)) {
      const forwarded = await forwardAuth(c, upstream, 'authserver/authenticate', body)
      if (!forwarded.response?.ok || !forwarded.payload?.accessToken) continue
      const accessToken = await makeFederatedToken(c, upstream, forwarded.payload, body.clientToken)
      return c.json({ ...forwarded.payload, accessToken, clientToken: forwarded.payload.clientToken || body.clientToken || crypto.randomUUID() })
    }
    return error(c, 403, 'Invalid credentials')
  })
  app.post('/api/ygg/authserver/refresh', async (c) => {
    const body = await c.req.json().catch(() => null) as { accessToken?: string; clientToken?: string; requestUser?: boolean } | null
    const identity = await verifyJwt(body?.accessToken, getSecret(c)); if (!identity?.sub || await isRevoked(getStore(c), body?.accessToken)) return error(c, 403, 'Invalid token')
    const federatedIdentity = federated(identity); const settings = await settingsFor(c)
    if (federatedIdentity) {
      const upstream = await upstreamById(c, federatedIdentity.upstreamId)
      if (!upstream) return error(c, 403, 'Upstream is no longer configured')
      const forwarded = await forwardAuth(c, upstream, 'authserver/refresh', { accessToken: federatedIdentity.accessToken, clientToken: body?.clientToken || federatedIdentity.clientToken, requestUser: body?.requestUser })
      if (!forwarded.response?.ok || !forwarded.payload?.accessToken) return error(c, 403, 'Upstream token refresh failed')
      const accessToken = await makeFederatedToken(c, upstream, forwarded.payload, body?.clientToken || federatedIdentity.clientToken)
      return c.json({ ...forwarded.payload, accessToken, clientToken: forwarded.payload.clientToken || body?.clientToken || federatedIdentity.clientToken || crypto.randomUUID() })
    }
    const account = await getStore(c).getAccount(identity.sub); if (!account) return error(c, 403, 'Invalid token')
    const selected = await getProfile(c, account); const accessToken = await createJwt({ sub: account.id, email: account.email, role: account.role }, getSecret(c), Number(settings.ygg?.accessTokenTtlSeconds ?? 3600))
    return c.json({ accessToken, clientToken: body?.clientToken || crypto.randomUUID(), availableProfiles: [selected], selectedProfile: selected })
  })
  app.post('/api/ygg/authserver/validate', async (c) => {
    const body = await c.req.json().catch(() => null) as { accessToken?: string } | null; const identity = await verifyJwt(body?.accessToken, getSecret(c)); if (!identity || await isRevoked(getStore(c), body?.accessToken)) return error(c, 403, 'Invalid token')
    const federatedIdentity = federated(identity)
    if (federatedIdentity) { const upstream = await upstreamById(c, federatedIdentity.upstreamId); if (!upstream) return error(c, 403, 'Upstream is no longer configured'); const forwarded = await forwardAuth(c, upstream, 'authserver/validate', { accessToken: federatedIdentity.accessToken }); if (!forwarded.response?.ok) return error(c, 403, 'Invalid token') }
    return c.body(null, 204)
  })
  const revokeAndForward = async (c: any, path: 'invalidate' | 'signout') => {
    const body = await c.req.json().catch(() => null) as { accessToken?: string } | null; const identity = await verifyJwt(body?.accessToken, getSecret(c));
    if (identity && !await isRevoked(getStore(c), body?.accessToken)) { const federatedIdentity = federated(identity); if (federatedIdentity) { const upstream = await upstreamById(c, federatedIdentity.upstreamId); if (upstream) await forwardAuth(c, upstream, `authserver/${path}`, { accessToken: federatedIdentity.accessToken }) } await revoke(getStore(c), body?.accessToken) }
    return c.body(null, 204)
  }
  app.post('/api/ygg/authserver/invalidate', async (c) => revokeAndForward(c, 'invalidate'))
  app.post('/api/ygg/authserver/signout', async (c) => revokeAndForward(c, 'signout'))
  app.post('/api/ygg/sessionserver/session/minecraft/join', async (c) => {
    const body = await c.req.json().catch(() => null) as { accessToken?: string; selectedProfile?: string; serverId?: string } | null
    const identity = await verifyJwt(body?.accessToken, getSecret(c)); if (!body?.serverId || !identity?.sub || await isRevoked(getStore(c), body.accessToken)) return error(c, 403, 'Invalid token')
    const federatedIdentity = federated(identity)
    if (federatedIdentity) {
      const upstream = await upstreamById(c, federatedIdentity.upstreamId); if (!upstream) return error(c, 403, 'Upstream is no longer configured')
      if (body.selectedProfile && federatedIdentity.profile?.id && normalizeUuid(body.selectedProfile) !== normalizeUuid(federatedIdentity.profile.id)) return error(c, 403, 'Invalid profile')
      const forwarded = await forwardSession(upstream, 'session/minecraft/join', { accessToken: federatedIdentity.accessToken, selectedProfile: federatedIdentity.profile?.id, serverId: body.serverId })
      return forwarded.response?.ok ? c.body(null, 204) : error(c, forwarded.response?.status === 429 ? 429 : 403, 'Upstream join failed')
    }
    const account = await getStore(c).getAccount(identity.sub); if (!account) return error(c, 403, 'Invalid token')
    const selected = await getProfile(c, account); if (body.selectedProfile && normalizeUuid(body.selectedProfile) !== selected.id) return error(c, 403, 'Invalid profile')
    await getStore(c).createYggSession({ id: crypto.randomUUID(), profileId: selected.id, accountId: account.id, serverId: body.serverId, ip: requestKey(c), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() })
    return c.body(null, 204)
  })
  app.get('/api/ygg/sessionserver/session/minecraft/hasJoined', async (c) => {
    const username = c.req.query('username'); const serverId = c.req.query('serverId'); if (!username || !serverId) return error(c, 400, 'Missing username or serverId')
    const store = getStore(c); const account = await findByName(store, username)
    if (account) { const selected = await getProfile(c, account); if (await store.hasYggSession(selected.id, serverId)) return c.json(selected) }
    for (const upstream of enabledUpstreams(await settingsFor(c))) {
      const forwarded = await forwardSession(upstream, 'session/minecraft/hasJoined', undefined, `username=${encodeURIComponent(username)}&serverId=${encodeURIComponent(serverId)}`)
      if (forwarded.response?.ok && forwarded.payload) return c.json(forwarded.payload)
    }
    return c.body(null, 204)
  })
  app.get('/api/ygg/sessionserver/session/minecraft/profile/:uuid', async (c) => { if (!(await settingsFor(c)).ygg?.enabled) return error(c, 403, 'Ygg service disabled'); const account = await findByUuid(getStore(c), c.req.param('uuid')); const unsigned = c.req.query('unsigned') === 'true'; if (account) return c.json(await getProfile(c, account, unsigned)); const upstream = await upstreamProfile(c, c.req.param('uuid')) as any; return upstream ? c.json(unsigned ? { ...upstream, properties: (upstream.properties ?? []).map((item: any) => ({ name: item.name, value: item.value })) } : upstream) : error(c, 404, 'Profile not found') })
  app.post('/api/ygg/api/profiles/minecraft', async (c) => { if (!(await settingsFor(c)).ygg?.enabled) return error(c, 403, 'Ygg service disabled'); const names = await c.req.json().catch(() => null) as unknown; if (!Array.isArray(names)) return error(c, 400, 'Expected an array of usernames'); const cleanNames = names.slice(0, 100).filter((name): name is string => typeof name === 'string' && name.length > 0); const result: any[] = []; for (const name of cleanNames) { const account = await findByName(getStore(c), name); if (account) result.push(await getProfile(c, account)) } const missing = cleanNames.filter((name) => !result.some((item: any) => typeof item.name === 'string' && item.name.toLowerCase() === name.toLowerCase())); if (missing.length) result.push(...await upstreamProfilesByName(c, missing)); return c.json(result) })
}
