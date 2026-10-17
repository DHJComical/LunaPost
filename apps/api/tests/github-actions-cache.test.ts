import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createJwt, MemoryAccountStore } from '../src/auth.js'

const payload = {
  total_count: 1,
  artifacts: [{ id: 42, name: 'nightly', size_in_bytes: 128, created_at: '2026-10-16T00:00:00Z', expires_at: '2026-11-16T00:00:00Z', expired: false, workflow_run: null }],
}

const fixture = async () => {
  const store = new MemoryAccountStore()
  const env = { JWT_SECRET: 'github-actions-test-secret' }
  const account = { id: 'root-test', email: 'root@example.com', passwordHash: '', createdAt: new Date().toISOString(), verifiedAt: null, role: 'root' as const }
  await store.createAccount(account)
  const token = await createJwt({ sub: account.id, email: account.email, role: account.role }, env.JWT_SECRET)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  let calls = 0
  let authorization = ''
  const app = createApp({ authStore: store, externalFetch: async (_input, init) => {
    calls += 1
    authorization = new Headers(init?.headers).get('Authorization') ?? ''
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } })
  await store.setAppSetting('site_settings', JSON.stringify({ githubActions: { sharedEnabled: true, proxyEnabled: true, ttlSeconds: 300, apiKey: 'gh-secret' } }))
  return { app, env, headers, calls: () => calls, authorization: () => authorization }
}

test('client cache submission is read before proxying and refresh bypasses it', async () => {
  const { app, env, headers, calls, authorization } = await fixture()
  const base = '/api/v1/github/actions/artifacts?owner=owner&repo=repo&page=1&per_page=30'
  assert.equal((await app.request(base, {}, env)).status, 424)
  assert.equal(calls(), 0)
  assert.equal((await app.request(`${base}&proxy=1`, { method: 'GET' }, env)).status, 200)
  assert.equal(calls(), 1)
  assert.equal(authorization(), 'Bearer gh-secret')
  const cached = await app.request(base, {}, env)
  assert.equal(cached.status, 200)
  assert.deepEqual((await cached.json()).data, payload)
  assert.equal(calls(), 1)
  assert.equal((await app.request(`${base}&refresh=1`, {}, env)).status, 424)
  assert.equal(calls(), 1)
  const submitted = await app.request('/api/v1/github/actions/artifacts/cache?owner=owner&repo=repo&page=1&per_page=30', { method: 'POST', headers, body: JSON.stringify(payload) }, env)
  assert.equal(submitted.status, 200)
})

test('invalid client cache payloads are rejected', async () => {
  const { app, env } = await fixture()
  const response = await app.request('/api/v1/github/actions/artifacts/cache?owner=owner&repo=repo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ total_count: 1, artifacts: [{ id: 'unsafe' }] }) }, env)
  assert.equal(response.status, 400)
})
