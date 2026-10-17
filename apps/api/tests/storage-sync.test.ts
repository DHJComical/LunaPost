import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createJwt, MemoryAccountStore } from '../src/auth.js'
import { StoragePool, type StorageAdapter } from '../src/storage.js'

class FakeStorage implements StorageAdapter {
  readonly objects = new Map<string, { body: ArrayBuffer; contentType: string }>()
  async put(id: string, body: ArrayBuffer, contentType: string) { this.objects.set(id, { body, contentType }) }
  async get(id: string) { const object = this.objects.get(id); return object ? { ...object } : null }
}

const config = (id: string, primary = false) => ({ id, provider: 'r2' as const, enabled: true, primary, endpoint: '', region: '', bucket: '', accessKeyId: '', secretAccessKey: '', publicBaseUrl: '', pathPrefix: '' })

test('storage pool mirrors automatic uploads and falls back on reads', async () => {
  const primary = new FakeStorage(); const mirror = new FakeStorage()
  const pool = new StoragePool([{ id: 'primary', config: config('primary', true), adapter: primary, primary: true }, { id: 'mirror', config: config('mirror'), adapter: mirror }], 'automatic')
  const body = new TextEncoder().encode('hello').buffer
  await pool.put('file.bin', body, 'application/octet-stream')
  assert.equal((await mirror.get('file.bin'))?.body.byteLength, body.byteLength)
  primary.objects.clear()
  assert.equal((await pool.get('file.bin'))?.body.byteLength, body.byteLength)
})

test('admin can manually synchronize an object and inspect its status', async () => {
  const store = new MemoryAccountStore(); const account = { id: 'root', email: 'root@example.com', passwordHash: '', createdAt: new Date().toISOString(), verifiedAt: null, role: 'root' as const }
  await store.createAccount(account)
  const token = await createJwt({ sub: account.id, email: account.email, role: account.role }, 'storage-sync-test')
  const primary = new FakeStorage(); const mirror = new FakeStorage(); const body = new TextEncoder().encode('manual').buffer
  await primary.put('manual.bin', body, 'application/octet-stream')
  const pool = new StoragePool([{ id: 'primary', config: config('primary', true), adapter: primary, primary: true }, { id: 'mirror', config: config('mirror'), adapter: mirror }])
  const app = createApp({ authStore: store, storage: pool }); const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const response = await app.request('/api/v1/admin/storage/sync', { method: 'POST', headers, body: JSON.stringify({ key: 'manual.bin' }) }, { JWT_SECRET: 'storage-sync-test' })
  assert.equal(response.status, 200)
  assert.equal((await mirror.get('manual.bin'))?.body.byteLength, body.byteLength)
  const status = await app.request('/api/v1/admin/storage/sync?key=manual.bin', { headers }, { JWT_SECRET: 'storage-sync-test' })
  assert.equal((await status.json()).status.results[0].status, 'synced')
})
