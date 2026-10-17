import type { AccountMetadata, Organization, Project } from '@andrea/contracts'
import { drizzle } from 'drizzle-orm/d1'
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import { accounts as accountsTable, apiKeys as apiKeysTable, sessions as sessionsTable, projectDocuments as projectDocumentsTable, projects as projectsTable, projectFavorites as projectFavoritesTable, downloadEvents as downloadEventsTable, organizations as organizationsTable, organizationMembers as organizationMembersTable, projectMembers as projectMembersTable, notifications as notificationsTable, projectInvitations as projectInvitationsTable, appMeta as appMetaTable, yggSessions as yggSessionsTable, yggRevokedTokens as yggRevokedTokensTable, mojangOauthTokens as mojangOauthTokensTable, projectPublishTokens as projectPublishTokensTable, publishUploads as publishUploadsTable } from './db/schema.js'

export type AccountRole = 'user' | 'developer' | 'admin' | 'root'

export type AccountRecord = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
  verifiedAt: string | null
  role: AccountRole
  metadata?: AccountMetadata
}

export type SessionRecord = {
  idHash: string
  accountId: string
  expiresAt: string
}

export type AccountSummary = Pick<AccountRecord, 'id' | 'email' | 'createdAt' | 'verifiedAt' | 'role'>
export type OrganizationRecord = Organization
export type OrganizationMemberRole = 'owner' | 'admin' | 'member'
export type OrganizationMember = { organizationId: string; accountId: string; email: string; role: OrganizationMemberRole }
export type ApiKeyRecord = {
  id: string
  accountId: string
  keyHash: string
  name: string
  scopes: string[]
  createdAt: string
  revokedAt: string | null
}
export type ApiKeySummary = Omit<ApiKeyRecord, 'accountId' | 'keyHash'>
export type ProjectPublishToken = { id: string; projectSlug: string; accountId: string; tokenHash: string; name: string; scopes: string[]; createdAt: string; revokedAt: string | null }
export type ProjectMemberRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'member'
export type ProjectMember = { projectId: string; accountId: string; email: string; role: ProjectMemberRole }
export type ProjectInvitation = { id: string; projectId: string; projectSlug: string; inviterId: string; inviteeId: string | null; email: string; role: Exclude<ProjectMemberRole, 'owner'>; status: 'pending' | 'accepted' | 'declined'; createdAt: string }
export type SiteNotification = { id: string; accountId: string; type: string; title: string; body: string; data: Record<string, unknown>; readAt: string | null; createdAt: string }
export type YggSessionRecord = { id: string; accountId: string; profileId: string; serverId: string; ip: string | null; createdAt: string; expiresAt: string }
export type ProjectFavorite = { accountId: string; projectSlug: string; createdAt: string }
export type DownloadEvent = { id: string; projectSlug: string; fileId: string; versionId: string; accountId: string | null; source: string | null; createdAt: string }
export type ProjectEngagement = { downloads: number; favorites: number }
export type DashboardStats = { downloads: number; favorites: number; topDownloads: Array<{ projectSlug: string; count: number }>; topFavorites: Array<{ projectSlug: string; count: number }> }
export type PublishUploadRecord = {
  id: string
  projectSlug: string
  accountId: string
  filename: string
  size: number
  sha256: string | null
  contentType: string
  storageKey: string | null
  multipartId: string | null
  status: 'created' | 'complete'
  createdAt: string
  expiresAt: string
}

export interface AccountStore {
  countAccounts(): Promise<number>
  listAccounts(): Promise<AccountSummary[]>
  updateRole(id: string, role: AccountRole): Promise<boolean>
  setAccountVerified(id: string, verifiedAt: string | null): Promise<boolean>
  updateAccountMetadata(id: string, metadata: AccountMetadata): Promise<boolean>
  deleteAccount(id: string): Promise<boolean>
  listApiKeys(accountId: string): Promise<ApiKeySummary[]>
  findApiKey(keyHash: string): Promise<ApiKeyRecord | null>
  createProjectPublishToken(token: ProjectPublishToken): Promise<void>
  findProjectPublishToken(tokenHash: string): Promise<ProjectPublishToken | null>
  listProjectPublishTokens(projectSlug: string): Promise<Array<Omit<ProjectPublishToken, 'tokenHash' | 'accountId'>>>
  revokeProjectPublishToken(projectSlug: string, id: string): Promise<boolean>
  createApiKey(key: ApiKeyRecord): Promise<void>
  revokeApiKey(accountId: string, id: string): Promise<boolean>
  listStoredProjects(): Promise<Project[]>
  getStoredProject(slug: string): Promise<Project | null>
  saveStoredProject(project: Project): Promise<void>
  deleteStoredProject(slug: string): Promise<boolean>
  listOrganizations(accountId?: string): Promise<OrganizationRecord[]>
  getOrganization(slug: string): Promise<OrganizationRecord | null>
  createOrganization(organization: OrganizationRecord): Promise<void>
  listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]>
  setOrganizationMember(organizationId: string, accountId: string, role: OrganizationMemberRole): Promise<void>
  listProjectMembers(projectId: string): Promise<ProjectMember[]>
  setProjectMember(projectId: string, accountId: string, role: ProjectMemberRole): Promise<void>
  removeProjectMember(projectId: string, accountId: string): Promise<boolean>
  createInvitation(invitation: ProjectInvitation): Promise<void>
  listInvitations(accountId: string, email: string): Promise<ProjectInvitation[]>
  respondInvitation(id: string, accountId: string, status: 'accepted' | 'declined'): Promise<boolean>
  createNotification(notification: SiteNotification): Promise<void>
  listNotifications(accountId: string): Promise<SiteNotification[]>
  markNotificationRead(accountId: string, id: string): Promise<boolean>
  isProjectFavorite(accountId: string, projectSlug: string): Promise<boolean>
  setProjectFavorite(accountId: string, projectSlug: string, favorite: boolean): Promise<boolean>
  listProjectFavorites(accountId: string): Promise<ProjectFavorite[]>
  getProjectEngagement(projectSlug: string): Promise<ProjectEngagement>
  recordDownload(event: DownloadEvent): Promise<void>
  getDashboardStats(projectSlugs?: string[]): Promise<DashboardStats>
  getAppSetting(key: string): Promise<string | null>
  setAppSetting(key: string, value: string): Promise<void>
  createYggSession(session: YggSessionRecord): Promise<void>
  hasYggSession(profileId: string, serverId: string): Promise<boolean>
  revokeYggToken(tokenHash: string, accountId: string | null, revokedAt: string, expiresAt: string | null): Promise<void>
  isYggTokenRevoked(tokenHash: string): Promise<boolean>
  saveMojangToken(accountId: string, ciphertext: string, updatedAt: string, expiresAt: string | null): Promise<void>
  createPublishUpload(upload: PublishUploadRecord): Promise<void>
  getPublishUpload(id: string, accountId: string): Promise<PublishUploadRecord | null>
  getCompletedPublishUpload(id: string, accountId: string, projectSlug: string): Promise<PublishUploadRecord | null>
  completePublishUpload(id: string): Promise<void>
  findAccountByEmail(email: string): Promise<AccountRecord | null>
  getAccount(id: string): Promise<AccountRecord | null>
  createAccount(account: AccountRecord): Promise<void>
  createSession(session: SessionRecord): Promise<void>
  getSession(idHash: string): Promise<SessionRecord | null>
  deleteSession(idHash: string): Promise<void>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
// Cloudflare Workers rejects PBKDF2 iteration counts above 100,000 at the
// WebCrypto boundary. Keep this within the platform limit so registration and
// first-run setup work in Workers as well as Node. Existing hashes retain the
// iteration count encoded in their own string during verification.
const iterations = 100_000
const defaultJwtSecret = 'development-only-change-this-jwt-secret'

const toBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index]
  return result === 0
}

export const hashPassword = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`
}

export const verifyPassword = async (password: string, encoded: string) => {
  const [algorithm, iterationText, saltText, hashText] = encoded.split('$')
  if (algorithm !== 'pbkdf2-sha256' || !iterationText || !saltText || !hashText) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(saltText), iterations: Number(iterationText) },
    key,
    256,
  )
  return constantTimeEqual(new Uint8Array(bits), fromBase64Url(hashText))
}

export const hashSessionId = async (sessionId: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(sessionId))
  return toBase64Url(new Uint8Array(digest))
}

export const hashApiKey = hashSessionId

const base64UrlEncode = (value: string) => toBase64Url(encoder.encode(value))
const base64UrlDecode = (value: string) => decoder.decode(fromBase64Url(value))
const jwtKey = async (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret || defaultJwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export const createJwt = async (payload: { sub: string; email: string; role: AccountRole } & Record<string, unknown>, secret?: string, ttlSeconds = 900) => {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }))
  const unsigned = `${header}.${body}`
  const signature = await crypto.subtle.sign('HMAC', await jwtKey(secret ?? defaultJwtSecret), encoder.encode(unsigned))
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`
}

export const verifyJwt = async (token: string | undefined, secret?: string) => {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const unsigned = `${parts[0]}.${parts[1]}`
  if (!await crypto.subtle.verify('HMAC', await jwtKey(secret ?? defaultJwtSecret), fromBase64Url(parts[2]), encoder.encode(unsigned))) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { sub?: string; email?: string; role?: AccountRole; exp?: number } & Record<string, unknown>
    if (!payload.sub || !payload.email || !payload.role || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export class MemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, AccountRecord>()
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly apiKeys = new Map<string, ApiKeyRecord>()
  private readonly projects = new Map<string, Project>()
  private readonly organizations = new Map<string, OrganizationRecord>()
  private readonly organizationMembers = new Map<string, { accountId: string; role: OrganizationMemberRole }>()
  private readonly projectMembers = new Map<string, { accountId: string; role: ProjectMemberRole }>()
  private readonly invitations = new Map<string, ProjectInvitation>()
  private readonly notifications = new Map<string, SiteNotification>()
  private readonly favorites = new Map<string, ProjectFavorite>()
  private readonly downloads = new Map<string, DownloadEvent>()
  private readonly appSettings = new Map<string, string>()
  private readonly yggSessions = new Map<string, YggSessionRecord>()
  private readonly revokedYggTokens = new Map<string, { expiresAt: string | null }>()
  private readonly publishUploads = new Map<string, PublishUploadRecord>()

  async findAccountByEmail(email: string) {
    return [...this.accounts.values()].find((account) => account.email === email) ?? null
  }

  async countAccounts() {
    return this.accounts.size
  }

  async listAccounts() {
    return [...this.accounts.values()].map(({ id, email, createdAt, verifiedAt, role }) => ({ id, email, createdAt, verifiedAt, role }))
  }

  async updateRole(id: string, role: AccountRole) {
    const account = this.accounts.get(id)
    if (!account) return false
    account.role = role
    return true
  }
  async setAccountVerified(id: string, verifiedAt: string | null) { const account = this.accounts.get(id); if (!account) return false; account.verifiedAt = verifiedAt; return true }

  async updateAccountMetadata(id: string, metadata: AccountMetadata) {
    const account = this.accounts.get(id)
    if (!account) return false
    account.metadata = metadata
    return true
  }

  async deleteAccount(id: string) {
    const existed = this.accounts.delete(id)
    if (existed) for (const [key, session] of this.sessions) if (session.accountId === id) this.sessions.delete(key)
    if (existed) for (const [key, apiKey] of this.apiKeys) if (apiKey.accountId === id) this.apiKeys.delete(key)
    if (existed) for (const [key, favorite] of this.favorites) if (favorite.accountId === id) this.favorites.delete(key)
    if (existed) for (const [key, member] of this.projectMembers) if (member.accountId === id) this.projectMembers.delete(key)
    if (existed) for (const [key, member] of this.organizationMembers) if (member.accountId === id) this.organizationMembers.delete(key)
    if (existed) for (const [key, invitation] of this.invitations) if (invitation.inviterId === id || invitation.inviteeId === id) this.invitations.delete(key)
    if (existed) for (const [key, notification] of this.notifications) if (notification.accountId === id) this.notifications.delete(key)
    if (existed) for (const [key, session] of this.yggSessions) if (session.accountId === id) this.yggSessions.delete(key)
    if (existed) for (const [key, upload] of this.publishUploads) if (upload.accountId === id) this.publishUploads.delete(key)
    if (existed) for (const [key, organization] of this.organizations) if (organization.ownerId === id) { this.organizations.delete(key); for (const memberKey of this.organizationMembers.keys()) if (memberKey.startsWith(`${key}:`)) this.organizationMembers.delete(memberKey) }
    if (existed) for (const [key, project] of this.projects) if (project.ownerType === 'account' && project.ownerId === id) { this.projects.delete(key); for (const memberKey of this.projectMembers.keys()) if (memberKey.startsWith(`${project.id}:`)) this.projectMembers.delete(memberKey) }
    return existed
  }

  async listApiKeys(accountId: string) {
    return [...this.apiKeys.values()]
      .filter((key) => key.accountId === accountId)
      .map(({ accountId: _accountId, keyHash: _keyHash, ...summary }) => summary)
  }

  async createApiKey(key: ApiKeyRecord) { this.apiKeys.set(key.id, key) }

  async findApiKey(keyHash: string) {
    return [...this.apiKeys.values()].find((key) => key.keyHash === keyHash && !key.revokedAt) ?? null
  }
  async createProjectPublishToken(token: ProjectPublishToken) { this.apiKeys.set(`publish:${token.id}`, token as unknown as ApiKeyRecord) }
  async findProjectPublishToken(tokenHash: string) { return [...this.apiKeys.values()].find((key) => key.keyHash === tokenHash && !key.revokedAt && key.id.startsWith('publish:')) as unknown as ProjectPublishToken ?? null }
  async listProjectPublishTokens(projectSlug: string) { return ([...this.apiKeys.values()] as unknown as ProjectPublishToken[]).filter((key) => key.id.startsWith('publish:') && key.projectSlug === projectSlug).map(({ tokenHash: _tokenHash, accountId: _accountId, ...key }) => key) }
  async revokeProjectPublishToken(projectSlug: string, id: string) { const key = this.apiKeys.get(`publish:${id}`) as unknown as ProjectPublishToken | undefined; if (!key || key.projectSlug !== projectSlug || key.revokedAt) return false; key.revokedAt = new Date().toISOString(); return true }

  async revokeApiKey(accountId: string, id: string) {
    const key = this.apiKeys.get(id)
    if (!key || key.accountId !== accountId || key.revokedAt) return false
    key.revokedAt = new Date().toISOString()
    return true
  }

  async listStoredProjects() { return [...this.projects.values()] }
  async getStoredProject(slug: string) { return this.projects.get(slug) ?? null }
  async saveStoredProject(project: Project) { this.projects.set(project.slug, project) }
  async deleteStoredProject(slug: string) { return this.projects.delete(slug) }

  async listOrganizations(accountId?: string) {
    const all = [...this.organizations.values()]
    if (!accountId) return all
    return all.filter((organization) => this.organizationMembers.has(`${organization.id}:${accountId}`))
  }
  async getOrganization(slugOrId: string) { return [...this.organizations.values()].find((organization) => organization.slug === slugOrId || organization.id === slugOrId) ?? null }
  async createOrganization(organization: OrganizationRecord) { this.organizations.set(organization.id, organization) }
  async listOrganizationMembers(organizationId: string) {
    return [...this.organizationMembers.entries()]
      .filter(([key]) => key.startsWith(`${organizationId}:`))
      .map(([, member]) => ({ organizationId, accountId: member.accountId, email: this.accounts.get(member.accountId)?.email ?? '', role: member.role }))
      .filter((member) => Boolean(member.email))
  }
  async setOrganizationMember(organizationId: string, accountId: string, role: OrganizationMemberRole) { this.organizationMembers.set(`${organizationId}:${accountId}`, { accountId, role }) }

  async listProjectMembers(projectId: string) {
    return [...this.projectMembers.entries()]
      .filter(([key]) => key.startsWith(`${projectId}:`))
      .map(([, member]) => ({ projectId, accountId: member.accountId, email: this.accounts.get(member.accountId)?.email ?? '', role: member.role }))
      .filter((member) => Boolean(member.email))
  }
  async setProjectMember(projectId: string, accountId: string, role: ProjectMemberRole) { this.projectMembers.set(`${projectId}:${accountId}`, { accountId, role }) }
  async removeProjectMember(projectId: string, accountId: string) { return this.projectMembers.delete(`${projectId}:${accountId}`) }

  async createInvitation(invitation: ProjectInvitation) { this.invitations.set(invitation.id, invitation) }
  async listInvitations(accountId: string, email: string) { return [...this.invitations.values()].filter((item) => item.status === 'pending' && (item.inviteeId === accountId || item.email === email.toLowerCase())) }
  async respondInvitation(id: string, accountId: string, status: 'accepted' | 'declined') {
    const invitation = this.invitations.get(id)
    if (!invitation || invitation.status !== 'pending' || (invitation.inviteeId && invitation.inviteeId !== accountId)) return false
    invitation.status = status
    if (status === 'accepted') await this.setProjectMember(invitation.projectId, accountId, invitation.role)
    return true
  }
  async createNotification(notification: SiteNotification) { this.notifications.set(notification.id, notification) }
  async listNotifications(accountId: string) { return [...this.notifications.values()].filter((item) => item.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  async markNotificationRead(accountId: string, id: string) { const item = this.notifications.get(id); if (!item || item.accountId !== accountId) return false; item.readAt = new Date().toISOString(); return true }
  async isProjectFavorite(accountId: string, projectSlug: string) { return this.favorites.has(`${accountId}:${projectSlug}`) }
  async setProjectFavorite(accountId: string, projectSlug: string, favorite: boolean) {
    const key = `${accountId}:${projectSlug}`
    if (favorite) this.favorites.set(key, { accountId, projectSlug, createdAt: new Date().toISOString() })
    else this.favorites.delete(key)
    return favorite
  }
  async listProjectFavorites(accountId: string) { return [...this.favorites.values()].filter((item) => item.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  async getProjectEngagement(projectSlug: string) {
    return { downloads: [...this.downloads.values()].filter((item) => item.projectSlug === projectSlug).length, favorites: [...this.favorites.values()].filter((item) => item.projectSlug === projectSlug).length }
  }
  async recordDownload(event: DownloadEvent) { this.downloads.set(event.id, event) }
  async getDashboardStats(projectSlugs?: string[]) {
    if (projectSlugs && projectSlugs.length === 0) return { downloads: 0, favorites: 0, topDownloads: [], topFavorites: [] }
    const allowed = projectSlugs ? new Set(projectSlugs) : null
    const downloads = [...this.downloads.values()].filter((item) => !allowed || allowed.has(item.projectSlug))
    const favorites = [...this.favorites.values()].filter((item) => !allowed || allowed.has(item.projectSlug))
    const count = (items: Array<{ projectSlug: string }>) => [...items.reduce((map, item) => map.set(item.projectSlug, (map.get(item.projectSlug) ?? 0) + 1), new Map<string, number>())].map(([projectSlug, count]) => ({ projectSlug, count })).sort((a, b) => b.count - a.count).slice(0, 5)
    return { downloads: downloads.length, favorites: favorites.length, topDownloads: count(downloads), topFavorites: count(favorites) }
  }
  async getAppSetting(key: string) { return this.appSettings.get(key) ?? null }
  async setAppSetting(key: string, value: string) { this.appSettings.set(key, value) }
  async createYggSession(session: YggSessionRecord) { this.yggSessions.set(session.id, session) }
  async hasYggSession(profileId: string, serverId: string) { const now = Date.now(); return [...this.yggSessions.values()].some((item) => item.profileId === profileId && item.serverId === serverId && Date.parse(item.expiresAt) > now) }
  async revokeYggToken(tokenHash: string, _accountId: string | null, _revokedAt: string, expiresAt: string | null) { this.revokedYggTokens.set(tokenHash, { expiresAt }) }
  async isYggTokenRevoked(tokenHash: string) { const item = this.revokedYggTokens.get(tokenHash); if (!item) return false; if (item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) { this.revokedYggTokens.delete(tokenHash); return false } return true }
  async saveMojangToken(accountId: string, ciphertext: string, updatedAt: string, expiresAt: string | null) { this.appSettings.set(`mojang-token:${accountId}`, JSON.stringify({ ciphertext, updatedAt, expiresAt })) }
  async createPublishUpload(upload: PublishUploadRecord) { this.publishUploads.set(upload.id, upload) }
  async getPublishUpload(id: string, accountId: string) {
    const upload = this.publishUploads.get(id)
    return upload?.accountId === accountId ? upload : null
  }
  async getCompletedPublishUpload(id: string, accountId: string, projectSlug: string) {
    const upload = await this.getPublishUpload(id, accountId)
    return upload?.projectSlug === projectSlug && upload.status === 'complete' ? upload : null
  }
  async completePublishUpload(id: string) {
    const upload = this.publishUploads.get(id)
    if (upload) upload.status = 'complete'
  }

  async getAccount(id: string) {
    return this.accounts.get(id) ?? null
  }

  async createAccount(account: AccountRecord) {
    this.accounts.set(account.id, account)
  }

  async createSession(session: SessionRecord) {
    this.sessions.set(session.idHash, session)
  }

  async getSession(idHash: string) {
    const session = this.sessions.get(idHash)
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      this.sessions.delete(idHash)
      return null
    }
    return session
  }

  async deleteSession(idHash: string) {
    this.sessions.delete(idHash)
  }
}

type D1DatabaseLike = {
  prepare(query: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results?: T[] }>; run(): Promise<unknown> } }
}

export class D1AccountStore implements AccountStore {
  constructor(private readonly db: D1DatabaseLike) {}

  async countAccounts() {
    const rows = await drizzle(this.db as unknown as D1Database).select({ id: accountsTable.id }).from(accountsTable).all()
    return rows.length
  }

  async listAccounts() {
    return await drizzle(this.db as unknown as D1Database).select({ id: accountsTable.id, email: accountsTable.email, createdAt: accountsTable.createdAt, verifiedAt: accountsTable.verifiedAt, role: accountsTable.role }).from(accountsTable).orderBy(desc(accountsTable.createdAt)).all() as AccountSummary[]
  }

  async updateRole(id: string, role: AccountRole) {
    const existing = await this.getAccount(id)
    if (!existing) return false
    const result = await drizzle(this.db as unknown as D1Database).update(accountsTable).set({ role }).where(eq(accountsTable.id, id)).run()
    return Number(result.meta?.changes ?? 0) > 0
  }
  async setAccountVerified(id: string, verifiedAt: string | null) {
    const result = await drizzle(this.db as unknown as D1Database).update(accountsTable).set({ verifiedAt }).where(eq(accountsTable.id, id)).run()
    return Number(result.meta?.changes ?? 0) > 0
  }

  async updateAccountMetadata(id: string, metadata: AccountMetadata) {
    const result = await drizzle(this.db as unknown as D1Database).update(accountsTable).set({ metadataJson: JSON.stringify(metadata) }).where(eq(accountsTable.id, id)).run()
    return Number(result.meta?.changes ?? 0) > 0
  }

  async deleteAccount(id: string) {
    const orm = drizzle(this.db as unknown as D1Database)
    if (!await this.getAccount(id)) return false
    await orm.delete(sessionsTable).where(eq(sessionsTable.accountId, id)).run()
    await orm.delete(apiKeysTable).where(eq(apiKeysTable.accountId, id)).run()
    await orm.delete(projectFavoritesTable).where(eq(projectFavoritesTable.accountId, id)).run()
    await orm.delete(projectMembersTable).where(eq(projectMembersTable.accountId, id)).run()
    await orm.delete(organizationMembersTable).where(eq(organizationMembersTable.accountId, id)).run()
    await orm.delete(projectInvitationsTable).where(or(eq(projectInvitationsTable.inviterId, id), eq(projectInvitationsTable.inviteeId, id))).run()
    await orm.delete(notificationsTable).where(eq(notificationsTable.accountId, id)).run()
    await orm.delete(yggSessionsTable).where(eq(yggSessionsTable.accountId, id)).run()
    await orm.delete(mojangOauthTokensTable).where(eq(mojangOauthTokensTable.accountId, id)).run()
    await orm.delete(projectPublishTokensTable).where(eq(projectPublishTokensTable.accountId, id)).run()
    await orm.delete(publishUploadsTable).where(eq(publishUploadsTable.accountId, id)).run()
    await orm.update(projectsTable).set({ ownerId: null }).where(eq(projectsTable.ownerId, id)).run()
    await orm.delete(organizationsTable).where(eq(organizationsTable.ownerId, id)).run()
    const result = await orm.delete(accountsTable).where(eq(accountsTable.id, id)).run()
    return Number(result.meta?.changes ?? 0) > 0
  }

  async listApiKeys(accountId: string) {
    const rows = await drizzle(this.db as unknown as D1Database).select({ id: apiKeysTable.id, name: apiKeysTable.name, scopes: apiKeysTable.scopes, createdAt: apiKeysTable.createdAt, revokedAt: apiKeysTable.revokedAt }).from(apiKeysTable).where(eq(apiKeysTable.accountId, accountId)).orderBy(desc(apiKeysTable.createdAt)).all()
    return rows.map((key) => ({ ...key, scopes: JSON.parse(key.scopes) as string[] }))
  }

  async createApiKey(key: ApiKeyRecord) {
    await drizzle(this.db as unknown as D1Database).insert(apiKeysTable).values({ id: key.id, accountId: key.accountId, keyHash: key.keyHash, name: key.name, scopes: JSON.stringify(key.scopes), createdAt: key.createdAt, revokedAt: key.revokedAt }).run()
  }

  async findApiKey(keyHash: string) {
    const row = await drizzle(this.db as unknown as D1Database).select().from(apiKeysTable).where(and(eq(apiKeysTable.keyHash, keyHash), isNull(apiKeysTable.revokedAt))).get()
    return row ? { ...row, scopes: JSON.parse(row.scopes) as string[] } : null
  }
  async createProjectPublishToken(token: ProjectPublishToken) { await drizzle(this.db as unknown as D1Database).insert(projectPublishTokensTable).values({ id: token.id, projectSlug: token.projectSlug, accountId: token.accountId, tokenHash: token.tokenHash, name: token.name, scopes: JSON.stringify(token.scopes), createdAt: token.createdAt, revokedAt: token.revokedAt }).run() }
  async findProjectPublishToken(tokenHash: string) { const row = await drizzle(this.db as unknown as D1Database).select().from(projectPublishTokensTable).where(and(eq(projectPublishTokensTable.tokenHash, tokenHash), isNull(projectPublishTokensTable.revokedAt))).get(); return row ? { ...row, scopes: JSON.parse(row.scopes) as string[] } : null }
  async listProjectPublishTokens(projectSlug: string) { const rows = await drizzle(this.db as unknown as D1Database).select().from(projectPublishTokensTable).where(eq(projectPublishTokensTable.projectSlug, projectSlug)).orderBy(desc(projectPublishTokensTable.createdAt)).all(); return rows.map((row) => ({ ...row, scopes: JSON.parse(row.scopes) })) }
  async revokeProjectPublishToken(projectSlug: string, id: string) { const result = await drizzle(this.db as unknown as D1Database).update(projectPublishTokensTable).set({ revokedAt: new Date().toISOString() }).where(and(eq(projectPublishTokensTable.id, id), eq(projectPublishTokensTable.projectSlug, projectSlug), isNull(projectPublishTokensTable.revokedAt))).run(); return Number(result.meta?.changes ?? 0) > 0 }

  async revokeApiKey(accountId: string, id: string) {
    const result = await drizzle(this.db as unknown as D1Database).update(apiKeysTable).set({ revokedAt: new Date().toISOString() }).where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.accountId, accountId), isNull(apiKeysTable.revokedAt))).run()
    return Number(result.meta?.changes ?? 0) > 0
  }

  async listStoredProjects() {
    try {
      const rows = await drizzle(this.db as unknown as D1Database).select({ projectJson: projectDocumentsTable.projectJson }).from(projectDocumentsTable).orderBy(desc(projectDocumentsTable.updatedAt)).all()
      return rows.map((row) => JSON.parse(row.projectJson) as Project)
    } catch {
      return []
    }
  }

  async getStoredProject(slug: string) {
    try {
      const row = await drizzle(this.db as unknown as D1Database).select({ projectJson: projectDocumentsTable.projectJson }).from(projectDocumentsTable).where(eq(projectDocumentsTable.slug, slug)).get()
      return row ? JSON.parse(row.projectJson) as Project : null
    } catch {
      return null
    }
  }

  async saveStoredProject(project: Project) {
    const now = new Date().toISOString()
    // project_documents is the rich JSON source used by the catalog, while the
    // normalized projects row backs foreign keys for members/invitations. Keep
    // both representations in sync so D1 relationship imports can succeed.
    const orm = drizzle(this.db as unknown as D1Database)
    const owner = project.ownerId ? await orm.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.id, project.ownerId)).get() : null
    await orm.insert(projectsTable).values({ id: project.id, slug: project.slug, title: project.title, type: project.type, description: project.description, ownerId: owner?.id ?? null, repositoryUrl: project.repositoryUrl ?? null, status: project.status, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: projectsTable.slug, set: { id: project.id, title: project.title, type: project.type, description: project.description, ownerId: owner?.id ?? null, repositoryUrl: project.repositoryUrl ?? null, status: project.status, updatedAt: now } }).run()
    await orm.insert(projectDocumentsTable).values({ slug: project.slug, projectJson: JSON.stringify(project), createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: projectDocumentsTable.slug, set: { projectJson: JSON.stringify(project), updatedAt: now } }).run()
  }

  async deleteStoredProject(slug: string) {
    const result = await drizzle(this.db as unknown as D1Database).delete(projectDocumentsTable).where(eq(projectDocumentsTable.slug, slug)).run()
    return Number(result.meta?.changes ?? 0) > 0
  }

  async listOrganizations(accountId?: string) {
    const orm = drizzle(this.db as unknown as D1Database)
    const fields = { id: organizationsTable.id, slug: organizationsTable.slug, name: organizationsTable.name, description: organizationsTable.description, avatarUrl: organizationsTable.avatarUrl, createdAt: organizationsTable.createdAt, ownerId: organizationsTable.ownerId }
    const query = orm.select(fields).from(organizationsTable).orderBy(asc(organizationsTable.name))
    if (accountId) return await query.innerJoin(organizationMembersTable, eq(organizationMembersTable.organizationId, organizationsTable.id)).where(eq(organizationMembersTable.accountId, accountId)).all() as OrganizationRecord[]
    return await query.all() as OrganizationRecord[]
  }
  async getOrganization(slugOrId: string) {
    return await drizzle(this.db as unknown as D1Database).select({ id: organizationsTable.id, slug: organizationsTable.slug, name: organizationsTable.name, description: organizationsTable.description, avatarUrl: organizationsTable.avatarUrl, createdAt: organizationsTable.createdAt, ownerId: organizationsTable.ownerId }).from(organizationsTable).where(or(eq(organizationsTable.slug, slugOrId), eq(organizationsTable.id, slugOrId))).get() as OrganizationRecord | null
  }
  async createOrganization(organization: OrganizationRecord) {
    await drizzle(this.db as unknown as D1Database).insert(organizationsTable).values({ id: organization.id, slug: organization.slug, name: organization.name, description: organization.description, avatarUrl: organization.avatarUrl ?? null, createdAt: organization.createdAt, ownerId: organization.ownerId }).run()
  }
  async listOrganizationMembers(organizationId: string) {
    const rows = await drizzle(this.db as unknown as D1Database).select({ organizationId: organizationMembersTable.organizationId, accountId: organizationMembersTable.accountId, email: accountsTable.email, role: organizationMembersTable.role }).from(organizationMembersTable).innerJoin(accountsTable, eq(accountsTable.id, organizationMembersTable.accountId)).where(eq(organizationMembersTable.organizationId, organizationId)).orderBy(asc(accountsTable.email)).all()
    return rows as OrganizationMember[]
  }
  async setOrganizationMember(organizationId: string, accountId: string, role: OrganizationMemberRole) {
    await drizzle(this.db as unknown as D1Database).insert(organizationMembersTable).values({ organizationId, accountId, role }).onConflictDoUpdate({ target: [organizationMembersTable.organizationId, organizationMembersTable.accountId], set: { role } }).run()
  }

  async listProjectMembers(projectId: string) {
    return await drizzle(this.db as unknown as D1Database).select({ projectId: projectMembersTable.projectId, accountId: projectMembersTable.accountId, email: accountsTable.email, role: projectMembersTable.role }).from(projectMembersTable).innerJoin(accountsTable, eq(accountsTable.id, projectMembersTable.accountId)).where(eq(projectMembersTable.projectId, projectId)).orderBy(asc(accountsTable.email)).all() as ProjectMember[]
  }

  async setProjectMember(projectId: string, accountId: string, role: ProjectMemberRole) {
    await drizzle(this.db as unknown as D1Database).insert(projectMembersTable).values({ projectId, accountId, role }).onConflictDoUpdate({ target: [projectMembersTable.projectId, projectMembersTable.accountId], set: { role } }).run()
  }

  async removeProjectMember(projectId: string, accountId: string) {
    const result = await drizzle(this.db as unknown as D1Database).delete(projectMembersTable).where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.accountId, accountId))).run()
    return Number(result.meta?.changes ?? 0) > 0
  }

  async createInvitation(invitation: ProjectInvitation) {
    await drizzle(this.db as unknown as D1Database).insert(projectInvitationsTable).values({ id: invitation.id, projectId: invitation.projectId, projectSlug: invitation.projectSlug, inviterId: invitation.inviterId, inviteeId: invitation.inviteeId, email: invitation.email, role: invitation.role, status: invitation.status, createdAt: invitation.createdAt }).run()
  }
  async listInvitations(accountId: string, email: string) {
    return await drizzle(this.db as unknown as D1Database).select().from(projectInvitationsTable).where(and(eq(projectInvitationsTable.status, 'pending'), or(eq(projectInvitationsTable.inviteeId, accountId), eq(projectInvitationsTable.email, email.toLowerCase())))).orderBy(desc(projectInvitationsTable.createdAt)).all() as ProjectInvitation[]
  }
  async respondInvitation(id: string, accountId: string, status: 'accepted' | 'declined') {
    const invitation = await drizzle(this.db as unknown as D1Database).select().from(projectInvitationsTable).where(and(eq(projectInvitationsTable.id, id), eq(projectInvitationsTable.status, 'pending'))).get() as ProjectInvitation | null
    if (!invitation || (invitation.inviteeId && invitation.inviteeId !== accountId)) return false
    await drizzle(this.db as unknown as D1Database).update(projectInvitationsTable).set({ status }).where(eq(projectInvitationsTable.id, id)).run()
    if (status === 'accepted') await this.setProjectMember(invitation.projectId, accountId, invitation.role)
    return true
  }
  async createNotification(notification: SiteNotification) {
    await drizzle(this.db as unknown as D1Database).insert(notificationsTable).values({ id: notification.id, accountId: notification.accountId, type: notification.type, title: notification.title, body: notification.body, data: JSON.stringify(notification.data), readAt: notification.readAt, createdAt: notification.createdAt }).run()
  }
  async listNotifications(accountId: string) {
    const rows = await drizzle(this.db as unknown as D1Database).select().from(notificationsTable).where(eq(notificationsTable.accountId, accountId)).orderBy(desc(notificationsTable.createdAt)).limit(100).all()
    return rows.map((item) => ({ ...item, data: JSON.parse(item.data) as Record<string, unknown> })) as SiteNotification[]
  }
  async markNotificationRead(accountId: string, id: string) {
    const result = await drizzle(this.db as unknown as D1Database).update(notificationsTable).set({ readAt: new Date().toISOString() }).where(and(eq(notificationsTable.id, id), eq(notificationsTable.accountId, accountId))).run()
    return Number(result.meta?.changes ?? 0) > 0
  }
  async isProjectFavorite(accountId: string, projectSlug: string) {
    return Boolean(await drizzle(this.db as unknown as D1Database).select({ accountId: projectFavoritesTable.accountId }).from(projectFavoritesTable).where(and(eq(projectFavoritesTable.accountId, accountId), eq(projectFavoritesTable.projectSlug, projectSlug))).get())
  }
  async setProjectFavorite(accountId: string, projectSlug: string, favorite: boolean) {
    const orm = drizzle(this.db as unknown as D1Database)
    if (favorite) await orm.insert(projectFavoritesTable).values({ accountId, projectSlug, createdAt: new Date().toISOString() }).onConflictDoNothing().run()
    else await orm.delete(projectFavoritesTable).where(and(eq(projectFavoritesTable.accountId, accountId), eq(projectFavoritesTable.projectSlug, projectSlug))).run()
    return favorite
  }
  async listProjectFavorites(accountId: string) {
    return await drizzle(this.db as unknown as D1Database).select({ accountId: projectFavoritesTable.accountId, projectSlug: projectFavoritesTable.projectSlug, createdAt: projectFavoritesTable.createdAt }).from(projectFavoritesTable).where(eq(projectFavoritesTable.accountId, accountId)).orderBy(desc(projectFavoritesTable.createdAt)).all() as ProjectFavorite[]
  }
  async getProjectEngagement(projectSlug: string) {
    const orm = drizzle(this.db as unknown as D1Database)
    const downloads = await orm.select({ value: count() }).from(downloadEventsTable).where(eq(downloadEventsTable.projectSlug, projectSlug)).get()
    const favorites = await orm.select({ value: count() }).from(projectFavoritesTable).where(eq(projectFavoritesTable.projectSlug, projectSlug)).get()
    return { downloads: Number(downloads?.value ?? 0), favorites: Number(favorites?.value ?? 0) }
  }
  async recordDownload(event: DownloadEvent) {
    await drizzle(this.db as unknown as D1Database).insert(downloadEventsTable).values({ id: event.id, projectSlug: event.projectSlug, fileId: event.fileId, versionId: event.versionId, accountId: event.accountId, source: event.source, createdAt: event.createdAt }).run()
  }
  async getDashboardStats(projectSlugs?: string[]) {
    if (projectSlugs && projectSlugs.length === 0) return { downloads: 0, favorites: 0, topDownloads: [], topFavorites: [] }
    const orm = drizzle(this.db as unknown as D1Database)
    const downloadWhere = projectSlugs?.length ? inArray(downloadEventsTable.projectSlug, projectSlugs) : undefined
    const favoriteWhere = projectSlugs?.length ? inArray(projectFavoritesTable.projectSlug, projectSlugs) : undefined
    const downloads = await orm.select({ value: count() }).from(downloadEventsTable).where(downloadWhere).get()
    const favorites = await orm.select({ value: count() }).from(projectFavoritesTable).where(favoriteWhere).get()
    const topDownloads = await orm.select({ projectSlug: downloadEventsTable.projectSlug, value: count() }).from(downloadEventsTable).where(downloadWhere).groupBy(downloadEventsTable.projectSlug).orderBy(desc(count())).limit(5).all()
    const topFavorites = await orm.select({ projectSlug: projectFavoritesTable.projectSlug, value: count() }).from(projectFavoritesTable).where(favoriteWhere).groupBy(projectFavoritesTable.projectSlug).orderBy(desc(count())).limit(5).all()
    return { downloads: Number(downloads?.value ?? 0), favorites: Number(favorites?.value ?? 0), topDownloads: topDownloads.map((item) => ({ projectSlug: item.projectSlug, count: Number(item.value) })), topFavorites: topFavorites.map((item) => ({ projectSlug: item.projectSlug, count: Number(item.value) })) }
  }
  async getAppSetting(key: string) {
    try {
      const row = await drizzle(this.db as unknown as D1Database).select({ value: appMetaTable.value }).from(appMetaTable).where(eq(appMetaTable.key, key)).get()
      return row?.value ?? null
    } catch { return null }
  }
  async setAppSetting(key: string, value: string) {
    await drizzle(this.db as unknown as D1Database).insert(appMetaTable).values({ key, value, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: appMetaTable.key, set: { value, updatedAt: new Date().toISOString() } }).run()
  }
  async createYggSession(session: YggSessionRecord) { await drizzle(this.db as unknown as D1Database).insert(yggSessionsTable).values({ id: session.id, accountId: session.accountId, profileId: session.profileId, serverId: session.serverId, ip: session.ip, createdAt: session.createdAt, expiresAt: session.expiresAt }).run() }
  async hasYggSession(profileId: string, serverId: string) { const now = new Date().toISOString(); const orm = drizzle(this.db as unknown as D1Database); await orm.delete(yggSessionsTable).where(lte(yggSessionsTable.expiresAt, now)).run(); const row = await orm.select({ id: yggSessionsTable.id }).from(yggSessionsTable).where(and(eq(yggSessionsTable.profileId, profileId), eq(yggSessionsTable.serverId, serverId), gt(yggSessionsTable.expiresAt, now))).limit(1).get(); return Boolean(row) }
  async revokeYggToken(tokenHash: string, accountId: string | null, revokedAt: string, expiresAt: string | null) { await drizzle(this.db as unknown as D1Database).insert(yggRevokedTokensTable).values({ tokenHash, accountId, revokedAt, expiresAt }).onConflictDoNothing().run() }
  async isYggTokenRevoked(tokenHash: string) { const now = new Date().toISOString(); const row = await drizzle(this.db as unknown as D1Database).select({ tokenHash: yggRevokedTokensTable.tokenHash }).from(yggRevokedTokensTable).where(and(eq(yggRevokedTokensTable.tokenHash, tokenHash), or(isNull(yggRevokedTokensTable.expiresAt), gt(yggRevokedTokensTable.expiresAt, now)))).get(); return Boolean(row) }
  async saveMojangToken(accountId: string, ciphertext: string, updatedAt: string, expiresAt: string | null) { await drizzle(this.db as unknown as D1Database).insert(mojangOauthTokensTable).values({ accountId, refreshTokenCiphertext: ciphertext, createdAt: updatedAt, updatedAt, expiresAt }).onConflictDoUpdate({ target: mojangOauthTokensTable.accountId, set: { refreshTokenCiphertext: ciphertext, updatedAt, expiresAt } }).run() }
  async createPublishUpload(upload: PublishUploadRecord) { await drizzle(this.db as unknown as D1Database).insert(publishUploadsTable).values({ id: upload.id, projectSlug: upload.projectSlug, accountId: upload.accountId, filename: upload.filename, size: upload.size, sha256: upload.sha256, contentType: upload.contentType, storageKey: upload.storageKey, multipartId: upload.multipartId, status: upload.status, createdAt: upload.createdAt, expiresAt: upload.expiresAt }).run() }
  async getPublishUpload(id: string, accountId: string) { return (await drizzle(this.db as unknown as D1Database).select().from(publishUploadsTable).where(and(eq(publishUploadsTable.id, id), eq(publishUploadsTable.accountId, accountId))).get() as PublishUploadRecord | undefined) ?? null }
  async getCompletedPublishUpload(id: string, accountId: string, projectSlug: string) { return (await drizzle(this.db as unknown as D1Database).select().from(publishUploadsTable).where(and(eq(publishUploadsTable.id, id), eq(publishUploadsTable.accountId, accountId), eq(publishUploadsTable.projectSlug, projectSlug), eq(publishUploadsTable.status, 'complete'))).get() as PublishUploadRecord | undefined) ?? null }
  async completePublishUpload(id: string) { await drizzle(this.db as unknown as D1Database).update(publishUploadsTable).set({ status: 'complete' }).where(eq(publishUploadsTable.id, id)).run() }

  async findAccountByEmail(email: string) {
    const account = await drizzle(this.db as unknown as D1Database).select().from(accountsTable).where(eq(accountsTable.email, email)).get() as any
    return account ? { ...account, metadata: account.metadataJson ? JSON.parse(account.metadataJson) as AccountMetadata : {} } : null
  }

  async getAccount(id: string) {
    const account = await drizzle(this.db as unknown as D1Database).select().from(accountsTable).where(eq(accountsTable.id, id)).get() as any
    return account ? { ...account, metadata: account.metadataJson ? JSON.parse(account.metadataJson) as AccountMetadata : {} } : null
  }

  async createAccount(account: AccountRecord) {
    await drizzle(this.db as unknown as D1Database).insert(accountsTable).values({ id: account.id, email: account.email, passwordHash: account.passwordHash, createdAt: account.createdAt, verifiedAt: account.verifiedAt, role: account.role, metadataJson: JSON.stringify(account.metadata ?? {}) }).run()
  }

  async createSession(session: SessionRecord) {
    await drizzle(this.db as unknown as D1Database).insert(sessionsTable).values({ idHash: session.idHash, accountId: session.accountId, expiresAt: session.expiresAt }).run()
  }

  async getSession(idHash: string) {
    const session = await drizzle(this.db as unknown as D1Database).select().from(sessionsTable).where(eq(sessionsTable.idHash, idHash)).get() as SessionRecord | undefined
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (session) await this.deleteSession(idHash)
      return null
    }
    return session
  }

  async deleteSession(idHash: string) {
    await drizzle(this.db as unknown as D1Database).delete(sessionsTable).where(eq(sessionsTable.idHash, idHash)).run()
  }
}

export const accountView = (account: AccountRecord) => ({
  id: account.id,
  email: account.email,
  createdAt: account.createdAt,
  verifiedAt: account.verifiedAt,
  role: account.role,
  metadata: account.metadata ?? {},
})

