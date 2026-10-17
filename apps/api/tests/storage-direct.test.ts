import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createJwt, MemoryAccountStore } from '../src/auth.js'
import { TencentCosStorage } from '../src/storage.js'

const config = { provider: 'tencent_cos' as const, region: 'ap-guangzhou', bucket: 'test-123', accessKeyId: 'test-id', secretAccessKey: 'test-secret', endpoint: '', publicBaseUrl: '', pathPrefix: 'Files' }
const signature = (time: string, canonical: string) => {
  const key = createHmac('sha1', config.secretAccessKey).update(time).digest('hex')
  const digest = createHash('sha1').update(canonical).digest('hex')
  return createHmac('sha1', key).update(`sha1\n${time}\n${digest}\n`).digest('hex')
}

test('COS PUT and GET URLs match independent SHA-1 signature calculation', async () => {
  const storage = new TencentCosStorage(config)
  for (const method of ['put', 'get']) {
    const url = new URL(await (method === 'put' ? storage.createUploadUrl("A file!.jar") : storage.getRedirectUrl("A file!.jar")))
    assert.equal(url.pathname, '/Files/A%20file%21.jar')
    assert.equal(url.searchParams.get('q-signature'), signature(url.searchParams.get('q-key-time')!, `${method}\n/Files/A file!.jar\n\nhost=test-123.cos.ap-guangzhou.myqcloud.com\n`))
    assert.ok(!url.href.includes(config.secretAccessKey))
  }
})

test('COS authenticated requests preserve case in signed query and header values', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    const authorization = new URLSearchParams(new Headers(init.headers).get('Authorization')!)
    assert.equal(authorization.get('q-url-param-list'), input.searchParams.has('uploadId') ? 'partnumber;uploadid' : '')
    const query = input.searchParams.has('uploadId') ? 'partnumber=1&uploadid=AbC%2B%3D' : ''
    const headers = init.method === 'PUT' && !query ? 'content-type=application%2FJava-Archive&host=test-123.cos.ap-guangzhou.myqcloud.com' : 'host=test-123.cos.ap-guangzhou.myqcloud.com'
    assert.equal(authorization.get('q-signature'), signature(authorization.get('q-key-time')!, `${init.method!.toLowerCase()}\n${input.pathname}\n${query}\n${headers}\n`))
    return new Response(null, { status: 200, headers: { ETag: 'test' } })
  })
  const storage = new TencentCosStorage(config)
  await storage.put('test.jar', new ArrayBuffer(1), 'application/Java-Archive')
  await storage.uploadPart('test.jar', 'AbC+=', 1, new ArrayBuffer(1))
  assert.equal(await storage.head('test.jar'), true)
})

test('primary COS form changes persist and a direct upload session signs without proxying bytes', async (t) => {
  const store = new MemoryAccountStore()
  const env = { JWT_SECRET: 'test-secret' }
  const account = { id: 'root', email: 'root@example.test', role: 'root' as const, passwordHash: '', createdAt: new Date().toISOString(), verifiedAt: null }
  await store.createAccount(account)
  const headers = { Authorization: `Bearer ${await createJwt({ sub: account.id, email: account.email, role: account.role }, env.JWT_SECRET)}`, 'Content-Type': 'application/json' }
  const app = createApp({ authStore: store })
  const { settings } = await (await app.request('/api/v1/admin/settings', { headers }, env)).json()
  Object.assign(settings.storage, config)
  // The UI still sends the old R2 entry in the providers JSON.
  assert.equal(settings.storage.providers[0].provider, 'r2')
  const save = await app.request('/api/v1/admin/settings', { method: 'PUT', headers, body: JSON.stringify(settings) }, env)
  assert.equal(save.status, 200)
  const saved = (await save.json()).settings
  assert.equal(saved.storage.providers[0].provider, 'tencent_cos')
  assert.equal(saved.storage.providers[0].bucket, config.bucket)
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200 }))
  const response = await app.request('/api/v1/storage/direct-uploads', { method: 'POST', headers, body: JSON.stringify({ filename: 'mod.jar', size: 200_000_000, purpose: 'account' }) }, env)
  assert.equal(response.status, 201)
  const session = await response.json()
  assert.equal(new URL(session.uploadUrl).hostname, 'test-123.cos.ap-guangzhou.myqcloud.com')
  assert.equal(fetchMock.mock.calls.length, 0)
  const complete = await app.request(session.completeUrl, { method: 'POST', headers }, env)
  assert.equal(complete.status, 200)
  assert.equal(fetchMock.mock.calls.length, 1)
  assert.equal(fetchMock.mock.calls[0].arguments[1].method, 'HEAD')
})

test('signing errors are not reported as unsupported direct uploads', async () => {
  const store = new MemoryAccountStore()
  const env = { JWT_SECRET: 'test-secret' }
  await store.createAccount({ id: 'root', email: 'root@example.test', role: 'root', passwordHash: '', createdAt: new Date().toISOString(), verifiedAt: null })
  const token = await createJwt({ sub: 'root', email: 'root@example.test', role: 'root' }, env.JWT_SECRET)
  const storage = { put: async () => {}, get: async () => null, createUploadUrl: async () => { throw new Error('signer failed') } }
  const app = createApp({ authStore: store, storage })
  const response = await app.request('/api/v1/storage/direct-uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'mod.jar', size: 1 }) }, env)
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'DIRECT_UPLOAD_SIGNING_FAILED')
})
