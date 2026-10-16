import type { Hono } from 'hono'
import type { AccountStore, AccountRecord } from './auth.js'
import { accountMetadataSchema } from '@andrea/contracts'
import { translateApiText as apiT } from './i18n.js'

type Bindings = { MICROSOFT_CLIENT_ID?: string; OAUTH_ENCRYPTION_KEY?: string; JWT_SECRET?: string }
const json = async (response: Response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error((body as any).error_description || (body as any).errorMessage || `upstream ${response.status}`); return body as any }
const deriveKey = async (secret: string) => { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)); return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']) }
const encrypt = async (value: string, secret: string) => { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(secret), new TextEncoder().encode(value)); const merged = new Uint8Array(iv.length + data.byteLength); merged.set(iv); merged.set(new Uint8Array(data), iv.length); let binary = ''; for (const byte of merged) binary += String.fromCharCode(byte); return btoa(binary) }

export function registerMojang(app: Hono<any>, getStore: (c: any) => AccountStore, getAccount: (c: any) => Promise<AccountRecord | null>, getSettings?: (c: any) => Promise<any>) {
  const config = (c: any): Bindings => c.env ?? {}
  app.get('/api/v1/account/mojang/device-code', async (c) => {
    const account = await getAccount(c); const site = await getSettings?.(c); const clientId = site?.mojang?.clientId || config(c).MICROSOFT_CLIENT_ID; const tenant = site?.mojang?.tenant || 'consumers'
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    if (!clientId) return c.json({ error: { code: 'MOJANG_NOT_CONFIGURED', message: apiT(c.req.header('accept-language'), 'apiErrors.microsoftClientIdMissing') } }, 503)
    if (site?.mojang && site.mojang.enabled === false) return c.json({ error: { code: 'MOJANG_DISABLED', message: apiT(c.req.header('accept-language'), 'apiErrors.mojangSyncDisabled') } }, 403)
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, scope: 'XboxLive.signin offline_access' }) })
    try { return c.json(await json(response)) } catch (cause) { return c.json({ error: { code: 'MOJANG_UPSTREAM_ERROR', message: cause instanceof Error ? cause.message : apiT(c.req.header('accept-language'), 'apiErrors.microsoftRequestFailed') } }, 502) }
  })
  app.post('/api/v1/account/mojang/poll', async (c) => {
    const account = await getAccount(c); const site = await getSettings?.(c); const clientId = site?.mojang?.clientId || config(c).MICROSOFT_CLIENT_ID; const tenant = site?.mojang?.tenant || 'consumers'; const encryptionSecret = config(c).OAUTH_ENCRYPTION_KEY || config(c).JWT_SECRET
    if (!account) return c.json({ error: { code: 'UNAUTHORIZED', message: apiT(c.req.header('accept-language'), 'apiErrors.unauthorized') } }, 401)
    if (site?.mojang && site.mojang.enabled === false) return c.json({ error: { code: 'MOJANG_DISABLED', message: apiT(c.req.header('accept-language'), 'apiErrors.mojangSyncDisabled') } }, 403)
    if (!clientId || !encryptionSecret) return c.json({ error: { code: 'MOJANG_NOT_CONFIGURED', message: apiT(c.req.header('accept-language'), 'apiErrors.oauthSecretMissing') } }, 503)
    const body = await c.req.json().catch(() => null) as { deviceCode?: string } | null
    if (!body?.deviceCode) return c.json({ error: { code: 'INVALID_INPUT', message: apiT(c.req.header('accept-language'), 'apiErrors.deviceCodeRequired') } }, 400)
    try {
      const token = await json(await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: body.deviceCode }) }))
      const xbl = await json(await fetch('https://user.auth.xboxlive.com/user/authenticate', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${token.access_token}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' }) }))
      const xsts = await json(await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' }) }))
      const identity = xbl.DisplayClaims?.xui?.[0]?.uhs; const minecraft = await json(await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identityToken: `XBL3.0 x=${identity};${xsts.Token}` }) }))
      const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${minecraft.access_token}` } }); const profile = await json(profileResponse)
      const skin = Array.isArray(profile.skins) ? profile.skins.find((item: any) => item.state === 'ACTIVE')?.url ?? profile.skins[0]?.url : null
      const cape = Array.isArray(profile.capes) ? profile.capes.find((item: any) => item.state === 'ACTIVE')?.url ?? profile.capes[0]?.url : null
      const metadata = accountMetadataSchema.parse({ ...(account.metadata ?? {}), minecraftUuid: profile.id.toLowerCase(), skinUrl: skin, capeUrl: cape, uuidSource: 'mojang' })
      await getStore(c).updateAccountMetadata(account.id, metadata)
      await getStore(c).saveMojangToken(account.id, await encrypt(token.refresh_token, encryptionSecret), new Date().toISOString(), token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null)
      return c.json({ ok: true, account: { id: account.id, minecraftUuid: metadata.minecraftUuid, skinUrl: metadata.skinUrl, capeUrl: metadata.capeUrl, uuidSource: metadata.uuidSource, name: profile.name } })
    } catch (cause) { return c.json({ error: { code: 'MOJANG_AUTH_FAILED', message: cause instanceof Error ? cause.message : apiT(c.req.header('accept-language'), 'apiErrors.minecraftAuthFailed') } }, 502) }
  })
}
