import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { MemoryAccountStore } from '../src/auth.js'

test('Ygg upstreams authenticate and forward join/hasJoined requests', async () => {
  const store = new MemoryAccountStore()
  await store.setAppSetting('site_settings', JSON.stringify({ ygg: { enabled: true, allowLocalAccounts: false, upstreams: [{ id: 'little', name: 'LittleSkin', baseUrl: 'https://upstream.test/ygg', enabled: true, priority: 1 }] } }))
  const app = createApp({ authStore: store })
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; body?: any }> = []
  globalThis.fetch = (async (input, init) => {
    const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ url, body })
    if (url.endsWith('/authserver/authenticate')) return new Response(JSON.stringify({ accessToken: 'upstream-token', clientToken: 'client-token', selectedProfile: { id: 'abc-def', name: 'Steve', properties: [] }, availableProfiles: [{ id: 'abc-def', name: 'Steve', properties: [] }] }), { status: 200 })
    if (url.endsWith('/session/minecraft/join')) return new Response(null, { status: 204 })
    if (url.includes('/session/minecraft/hasJoined?')) return new Response(JSON.stringify({ id: 'abc-def', name: 'Steve', properties: [] }), { status: 200 })
    return new Response(null, { status: 404 })
  }) as typeof fetch
  try {
    const env = { JWT_SECRET: 'ygg-test-secret' }
    const auth = await app.request('/api/ygg/authserver/authenticate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Steve', password: 'password' }) }, env)
    assert.equal(auth.status, 200)
    const authenticated = await auth.json() as { accessToken: string; selectedProfile: { id: string } }
    assert.notEqual(authenticated.accessToken, 'upstream-token')
    const join = await app.request('/api/ygg/sessionserver/session/minecraft/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: authenticated.accessToken, selectedProfile: authenticated.selectedProfile.id, serverId: 'server-hash' }) }, env)
    assert.equal(join.status, 204)
    const hasJoined = await app.request('/api/ygg/sessionserver/session/minecraft/hasJoined?username=Steve&serverId=server-hash', {}, env)
    assert.equal(hasJoined.status, 200)
    assert.equal(calls.find((item) => item.url.endsWith('/session/minecraft/join'))?.body.accessToken, 'upstream-token')
  } finally { globalThis.fetch = originalFetch }
})

test('Ygg server config exposes the authlib-injector metadata URL', async () => {
  const app = createApp({ authStore: new MemoryAccountStore() })
  const response = await app.request('https://example.test/api/ygg/server-config', {}, { JWT_SECRET: 'ygg-test-secret' })
  assert.equal(response.status, 200)
  const payload = await response.json() as any
  assert.equal(payload.metadataUrl, 'https://example.test/api/ygg/meta')
  assert.equal(payload.authlibInjector.javaAgent, '-javaagent:authlib-injector.jar=https://example.test/api/ygg/meta')
  assert.equal(payload.serverProperties['online-mode'], 'true')
})
