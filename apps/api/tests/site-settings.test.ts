import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createJwt, MemoryAccountStore } from '../src/auth.js'

const fixture = async (role: 'admin' | 'root' = 'admin') => {
  const store = new MemoryAccountStore()
  const env = { JWT_SECRET: 'site-settings-test-secret' }
  const account = { id: 'admin-test', email: 'admin@example.com', passwordHash: '', createdAt: new Date().toISOString(), verifiedAt: null, role }
  await store.createAccount(account)
  const token = await createJwt({ sub: account.id, email: account.email, role: account.role }, env.JWT_SECRET)
  const app = createApp({ authStore: store })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const read = () => app.request('/api/v1/admin/settings', { headers }, env).then(r => r.json())
  const save = (body: unknown) => app.request('/api/v1/admin/settings', { method: 'PUT', headers, body: JSON.stringify(body) }, env)
  return { store, env, app, read, save }
}

test('new and existing installations default to rounded icons; public settings omit moderation', async () => {
  const { app, store, env, read } = await fixture()
  const { settings } = await read()
  assert.equal(settings.appearance.roundedProjectIcons, true)
  await store.setAppSetting('site_settings', JSON.stringify({ moderation: settings.moderation }))
  assert.equal((await read()).settings.appearance.roundedProjectIcons, true)
  const response = await app.request('/api/v1/settings', {}, env)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { settings: { appearance: { roundedProjectIcons: true, siteName: 'LunaPost', siteIconUrl: '/assets/projects/luna-launcher/icon.png' }, registration: { enabled: true, requireInviteCode: false, requireApproval: false }, githubActions: { sharedEnabled: false, proxyEnabled: false, ttlSeconds: 300 } } })
  assert.equal((await app.request('/api/v1/admin/settings', {}, env)).status, 403)
  assert.equal((await app.request('/api/v1/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }, env)).status, 403)
})

test('rounding choice persists and older clients do not reset it', async () => {
  const { store, env, read, save } = await fixture()
  const { settings } = await read()
  settings.appearance.roundedProjectIcons = false
  assert.equal((await save(settings)).status, 200)
  const restarted = createApp({ authStore: store })
  assert.deepEqual(await (await restarted.request('/api/v1/settings', {}, env)).json(), { settings: { appearance: { roundedProjectIcons: false, siteName: 'LunaPost', siteIconUrl: '/assets/projects/luna-launcher/icon.png' }, registration: { enabled: true, requireInviteCode: false, requireApproval: false }, githubActions: { sharedEnabled: false, proxyEnabled: false, ttlSeconds: 300 } } })
  assert.equal((await save({ moderation: settings.moderation, registration: settings.registration, ygg: settings.ygg })).status, 200)
  assert.equal((await read()).settings.appearance.roundedProjectIcons, false)
  assert.deepEqual((await read()).settings.moderation, settings.moderation)
  settings.appearance.roundedProjectIcons = true
  assert.equal((await save(settings)).status, 200)
  assert.equal((await read()).settings.appearance.roundedProjectIcons, true)
})

test('invalid appearance settings are rejected without changing saved values', async () => {
  const { read, save } = await fixture()
  const { settings } = await read()
  for (const appearance of [null, false, [], 'square', { roundedProjectIcons: 'false' }, { roundedProjectIcons: 0 }, { roundedProjectIcons: null }]) {
    assert.equal((await save({ ...settings, appearance })).status, 400)
    assert.deepEqual((await read()).settings, settings)
  }
})


test('only root can change the site identity', async () => {
  const nonRoot = await fixture('admin')
  const current = (await nonRoot.read()).settings
  current.appearance.siteName = 'Blocked'
  assert.equal((await nonRoot.save(current)).status, 403)
  const root = await fixture('root')
  const settings = (await root.read()).settings
  settings.appearance.siteName = 'LunaPost Studio'
  settings.appearance.siteIconUrl = 'https://example.com/site-icon.png'
  assert.equal((await root.save(settings)).status, 200)
  const saved = (await root.read()).settings
  assert.equal(saved.appearance.siteName, 'LunaPost Studio')
  assert.equal(saved.appearance.siteIconUrl, 'https://example.com/site-icon.png')
})

test('storage provider settings persist while credentials stay hidden from admins', async () => {
  const root = await fixture('root')
  const settings = (await root.read()).settings
  settings.storage = { provider: 'tencent_cos', endpoint: 'https://cos.example.test', region: 'ap-guangzhou', bucket: 'lunapost-1250000000', accessKeyId: 'secret-id', secretAccessKey: 'secret-key', publicBaseUrl: 'https://cdn.example.test', pathPrefix: 'files' }
  assert.equal((await root.save(settings)).status, 200)
  assert.equal((await root.read()).settings.storage.secretAccessKey, 'secret-key')
  const admin = await fixture('admin')
  await admin.store.setAppSetting('site_settings', JSON.stringify((await root.read()).settings))
  const adminSettings = (await admin.read()).settings
  assert.equal(adminSettings.storage.accessKeyId, '')
  assert.equal(adminSettings.storage.secretAccessKey, '')
})

test('multiple storage providers and automatic sync mode persist', async () => {
  const root = await fixture('root')
  const settings = (await root.read()).settings
  settings.storage.syncMode = 'automatic'
  settings.storage.providers = [
    { ...settings.storage.providers[0], id: 'r2-primary', primary: true, enabled: true },
    { id: 'cos-mirror', name: 'COS mirror', provider: 'tencent_cos', primary: false, enabled: true, endpoint: 'https://cos.example.test', region: 'ap-guangzhou', bucket: 'bucket', accessKeyId: 'id', secretAccessKey: 'secret', publicBaseUrl: '', pathPrefix: 'mirror' },
  ]
  assert.equal((await root.save(settings)).status, 200)
  const saved = (await root.read()).settings
  assert.equal(saved.storage.syncMode, 'automatic')
  assert.deepEqual(saved.storage.providers.map((item: any) => item.id), ['r2-primary', 'cos-mirror'])
  assert.equal(saved.storage.providers[1].secretAccessKey, 'secret')
})
