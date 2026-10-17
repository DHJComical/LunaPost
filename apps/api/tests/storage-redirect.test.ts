import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import type { StorageAdapter } from '../src/storage.js'

test('storage downloads can redirect to a provider signed URL', async () => {
  const storage: StorageAdapter = {
    put: async () => undefined,
    get: async () => null,
    getRedirectUrl: async (id) => `https://cos.example.test/${id}?signature=test`,
  }
  const app = createApp({ storage })
  const response = await app.request('/api/v1/storage/file-123', {}, {})
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://cos.example.test/file-123?signature=test')
})
