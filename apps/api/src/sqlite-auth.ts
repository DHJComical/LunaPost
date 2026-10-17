import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import type { AccountMetadata, Project } from '@andrea/contracts'
import { createSqliteDatabase, type AppSqliteDatabase } from './db/client.js'
import { accounts as accountsTable, apiKeys as apiKeysTable, sessions as sessionsTable, projectDocuments as projectDocumentsTable, projects as projectsTable, projectFavorites as projectFavoritesTable, downloadEvents as downloadEventsTable, organizations as organizationsTable, organizationMembers as organizationMembersTable, projectMembers as projectMembersTable, notifications as notificationsTable, projectInvitations as projectInvitationsTable, appMeta as appMetaTable, yggSessions as yggSessionsTable, yggRevokedTokens as yggRevokedTokensTable, mojangOauthTokens as mojangOauthTokensTable, projectPublishTokens as projectPublishTokensTable, publishUploads as publishUploadsTable } from './db/schema.js'
import type { AccountRecord, AccountStore, AccountSummary, ApiKeyRecord, ApiKeySummary, DownloadEvent, ProjectEngagement, ProjectFavorite, ProjectInvitation, ProjectMember, ProjectMemberRole, SiteNotification, SessionRecord, DashboardStats, ProjectPublishToken, AccountRole, OrganizationMember, OrganizationMemberRole, OrganizationRecord, YggSessionRecord, PublishUploadRecord } from './auth.js'

export class SqliteAccountStore implements AccountStore {
  private readonly db: DatabaseSync
  private readonly orm: AppSqliteDatabase

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        verified_at TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS project_publish_tokens (id TEXT PRIMARY KEY, project_slug TEXT NOT NULL, account_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '["release:write"]', created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE IF NOT EXISTS publish_uploads (id TEXT PRIMARY KEY, project_slug TEXT NOT NULL, account_id TEXT NOT NULL, filename TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT, content_type TEXT NOT NULL, storage_key TEXT, multipart_id TEXT, status TEXT NOT NULL DEFAULT 'created', created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        repository_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version_number TEXT NOT NULL,
        version_type TEXT NOT NULL,
        changelog TEXT NOT NULL DEFAULT '',
        published_at TEXT,
        UNIQUE(project_id, version_number)
      );
      CREATE INDEX IF NOT EXISTS project_versions_project_number_idx ON project_versions(project_id, version_number);
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        size INTEGER,
        sha1 TEXT,
        sha512 TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        region TEXT NOT NULL DEFAULT 'GLOBAL',
        url TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS wiki_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        repository TEXT NOT NULL,
        branch TEXT NOT NULL DEFAULT 'main',
        content_root TEXT NOT NULL DEFAULT 'docs',
        revision TEXT,
        UNIQUE(project_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wiki_bindings_project_idx ON wiki_bindings(project_id);
      CREATE TABLE IF NOT EXISTS project_documents (
        slug TEXT PRIMARY KEY,
        project_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_documents_updated_at_idx ON project_documents(updated_at);
      CREATE TABLE IF NOT EXISTS project_members (
        project_id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY(project_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS project_invitations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        project_slug TEXT NOT NULL,
        inviter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        invitee_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_invitations_recipient_idx ON project_invitations(invitee_id, email, status);
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        read_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notifications_account_idx ON notifications(account_id, created_at);
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        avatar_url TEXT,
        created_at TEXT NOT NULL,
        owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS organization_members (
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY(organization_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS organization_members_account_idx ON organization_members(account_id);
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_favorites (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        project_slug TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(account_id, project_slug)
      );
      CREATE TABLE IF NOT EXISTS download_events (
        id TEXT PRIMARY KEY,
        project_slug TEXT NOT NULL,
        file_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        source TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS download_events_project_idx ON download_events(project_slug);
      CREATE TABLE IF NOT EXISTS ygg_sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, profile_id TEXT NOT NULL, server_id TEXT NOT NULL, ip TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ygg_sessions_lookup_idx ON ygg_sessions(profile_id, server_id, expires_at);
      CREATE TABLE IF NOT EXISTS ygg_revoked_tokens (token_hash TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE, revoked_at TEXT NOT NULL, expires_at TEXT);
      CREATE INDEX IF NOT EXISTS ygg_revoked_tokens_expiry_idx ON ygg_revoked_tokens(expires_at);
      CREATE TABLE IF NOT EXISTS mojang_oauth_tokens (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, refresh_token_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT);
    `)
    try { this.db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user'") } catch { /* existing schema already has role */ }
    try { this.db.exec("ALTER TABLE accounts ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'") } catch { /* existing schema already has metadata */ }
    this.db.exec("UPDATE accounts SET role = 'root' WHERE id = (SELECT id FROM accounts WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM accounts WHERE role = 'root')")
    this.orm = createSqliteDatabase(this.db)
  }




  async countAccounts() {
    const rows = await this.orm.select({ id: accountsTable.id }).from(accountsTable).all()
    return rows.length
  }

  async listAccounts() {
    return await this.orm.select({ id: accountsTable.id, email: accountsTable.email, createdAt: accountsTable.createdAt, verifiedAt: accountsTable.verifiedAt, role: accountsTable.role }).from(accountsTable).orderBy(desc(accountsTable.createdAt)).all() as AccountSummary[]
  }

  async updateRole(id: string, role: AccountRole) {
    const existing = await this.getAccount(id)
    if (!existing) return false
    await this.orm.update(accountsTable).set({ role }).where(eq(accountsTable.id, id)).run()
    return true
  }
  async setAccountVerified(id: string, verifiedAt: string | null) {
    if (!await this.getAccount(id)) return false
    await this.orm.update(accountsTable).set({ verifiedAt }).where(eq(accountsTable.id, id)).run()
    return true
  }

  async updateAccountMetadata(id: string, metadata: AccountMetadata) {
    if (!await this.getAccount(id)) return false
    await this.orm.update(accountsTable).set({ metadataJson: JSON.stringify(metadata) }).where(eq(accountsTable.id, id)).run()
    return true
  }

  async deleteAccount(id: string) {
    const orm = this.orm
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
    await orm.delete(accountsTable).where(eq(accountsTable.id, id)).run()
    return true
  }

  async listApiKeys(accountId: string) {
    const rows = await this.orm.select({ id: apiKeysTable.id, name: apiKeysTable.name, scopes: apiKeysTable.scopes, createdAt: apiKeysTable.createdAt, revokedAt: apiKeysTable.revokedAt }).from(apiKeysTable).where(eq(apiKeysTable.accountId, accountId)).orderBy(desc(apiKeysTable.createdAt)).all()
    return rows.map((key) => ({ ...key, scopes: JSON.parse(key.scopes) as string[] }))
  }

  async createApiKey(key: ApiKeyRecord) {
    await this.orm.insert(apiKeysTable).values({ id: key.id, accountId: key.accountId, keyHash: key.keyHash, name: key.name, scopes: JSON.stringify(key.scopes), createdAt: key.createdAt, revokedAt: key.revokedAt }).run()
  }

  async findApiKey(keyHash: string) {
    const row = await this.orm.select().from(apiKeysTable).where(and(eq(apiKeysTable.keyHash, keyHash), isNull(apiKeysTable.revokedAt))).get()
    return row ? { ...row, scopes: JSON.parse(row.scopes) as string[] } : null
  }
  async createProjectPublishToken(token: ProjectPublishToken) { await this.orm.insert(projectPublishTokensTable).values({ id: token.id, projectSlug: token.projectSlug, accountId: token.accountId, tokenHash: token.tokenHash, name: token.name, scopes: JSON.stringify(token.scopes), createdAt: token.createdAt, revokedAt: token.revokedAt }).run() }
  async findProjectPublishToken(tokenHash: string) { const row = await this.orm.select().from(projectPublishTokensTable).where(and(eq(projectPublishTokensTable.tokenHash, tokenHash), isNull(projectPublishTokensTable.revokedAt))).get(); return row ? { ...row, scopes: JSON.parse(row.scopes) as string[] } : null }
  async listProjectPublishTokens(projectSlug: string) { const rows = await this.orm.select().from(projectPublishTokensTable).where(eq(projectPublishTokensTable.projectSlug, projectSlug)).orderBy(desc(projectPublishTokensTable.createdAt)).all(); return rows.map((row) => ({ ...row, scopes: JSON.parse(row.scopes) })) }
  async revokeProjectPublishToken(projectSlug: string, id: string) { const existing = await this.orm.select({ id: projectPublishTokensTable.id }).from(projectPublishTokensTable).where(and(eq(projectPublishTokensTable.id, id), eq(projectPublishTokensTable.projectSlug, projectSlug), isNull(projectPublishTokensTable.revokedAt))).get(); if (!existing) return false; await this.orm.update(projectPublishTokensTable).set({ revokedAt: new Date().toISOString() }).where(eq(projectPublishTokensTable.id, id)).run(); return true }

  async revokeApiKey(accountId: string, id: string) {
    const existing = await this.orm.select({ id: apiKeysTable.id }).from(apiKeysTable).where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.accountId, accountId), isNull(apiKeysTable.revokedAt))).get()
    if (!existing) return false
    await this.orm.update(apiKeysTable).set({ revokedAt: new Date().toISOString() }).where(eq(apiKeysTable.id, id)).run()
    return true
  }

  async listStoredProjects() {
    try {
      const rows = await this.orm.select({ projectJson: projectDocumentsTable.projectJson }).from(projectDocumentsTable).orderBy(desc(projectDocumentsTable.updatedAt)).all()
      return rows.map((row) => JSON.parse(row.projectJson) as Project)
    } catch {
      return []
    }
  }

  async getStoredProject(slug: string) {
    try {
      const row = await this.orm.select({ projectJson: projectDocumentsTable.projectJson }).from(projectDocumentsTable).where(eq(projectDocumentsTable.slug, slug)).get()
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
    const orm = this.orm
    const owner = project.ownerId ? await orm.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.id, project.ownerId)).get() : null
    await orm.insert(projectsTable).values({ id: project.id, slug: project.slug, title: project.title, type: project.type, description: project.description, ownerId: owner?.id ?? null, repositoryUrl: project.repositoryUrl ?? null, status: project.status, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: projectsTable.slug, set: { id: project.id, title: project.title, type: project.type, description: project.description, ownerId: owner?.id ?? null, repositoryUrl: project.repositoryUrl ?? null, status: project.status, updatedAt: now } }).run()
    await orm.insert(projectDocumentsTable).values({ slug: project.slug, projectJson: JSON.stringify(project), createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: projectDocumentsTable.slug, set: { projectJson: JSON.stringify(project), updatedAt: now } }).run()
  }

  async deleteStoredProject(slug: string) {
    const existing = await this.orm.select({ slug: projectDocumentsTable.slug }).from(projectDocumentsTable).where(eq(projectDocumentsTable.slug, slug)).get()
    if (!existing) return false
    await this.orm.delete(projectDocumentsTable).where(eq(projectDocumentsTable.slug, slug)).run()
    return true
  }

  async listOrganizations(accountId?: string) {
    const orm = this.orm
    const fields = { id: organizationsTable.id, slug: organizationsTable.slug, name: organizationsTable.name, description: organizationsTable.description, avatarUrl: organizationsTable.avatarUrl, createdAt: organizationsTable.createdAt, ownerId: organizationsTable.ownerId }
    const query = orm.select(fields).from(organizationsTable).orderBy(asc(organizationsTable.name))
    if (accountId) return await query.innerJoin(organizationMembersTable, eq(organizationMembersTable.organizationId, organizationsTable.id)).where(eq(organizationMembersTable.accountId, accountId)).all() as OrganizationRecord[]
    return await query.all() as OrganizationRecord[]
  }
  async getOrganization(slugOrId: string) {
    return await this.orm.select({ id: organizationsTable.id, slug: organizationsTable.slug, name: organizationsTable.name, description: organizationsTable.description, avatarUrl: organizationsTable.avatarUrl, createdAt: organizationsTable.createdAt, ownerId: organizationsTable.ownerId }).from(organizationsTable).where(or(eq(organizationsTable.slug, slugOrId), eq(organizationsTable.id, slugOrId))).get() as OrganizationRecord | null
  }
  async createOrganization(organization: OrganizationRecord) {
    await this.orm.insert(organizationsTable).values({ id: organization.id, slug: organization.slug, name: organization.name, description: organization.description, avatarUrl: organization.avatarUrl ?? null, createdAt: organization.createdAt, ownerId: organization.ownerId }).run()
  }
  async listOrganizationMembers(organizationId: string) {
    const rows = await this.orm.select({ organizationId: organizationMembersTable.organizationId, accountId: organizationMembersTable.accountId, email: accountsTable.email, role: organizationMembersTable.role }).from(organizationMembersTable).innerJoin(accountsTable, eq(accountsTable.id, organizationMembersTable.accountId)).where(eq(organizationMembersTable.organizationId, organizationId)).orderBy(asc(accountsTable.email)).all()
    return rows as OrganizationMember[]
  }
  async setOrganizationMember(organizationId: string, accountId: string, role: OrganizationMemberRole) {
    await this.orm.insert(organizationMembersTable).values({ organizationId, accountId, role }).onConflictDoUpdate({ target: [organizationMembersTable.organizationId, organizationMembersTable.accountId], set: { role } }).run()
  }

  async listProjectMembers(projectId: string) {
    return await this.orm.select({ projectId: projectMembersTable.projectId, accountId: projectMembersTable.accountId, email: accountsTable.email, role: projectMembersTable.role }).from(projectMembersTable).innerJoin(accountsTable, eq(accountsTable.id, projectMembersTable.accountId)).where(eq(projectMembersTable.projectId, projectId)).orderBy(asc(accountsTable.email)).all() as ProjectMember[]
  }

  async setProjectMember(projectId: string, accountId: string, role: ProjectMemberRole) {
    await this.orm.insert(projectMembersTable).values({ projectId, accountId, role }).onConflictDoUpdate({ target: [projectMembersTable.projectId, projectMembersTable.accountId], set: { role } }).run()
  }

  async removeProjectMember(projectId: string, accountId: string) {
    const existing = await this.orm.select({ projectId: projectMembersTable.projectId }).from(projectMembersTable).where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.accountId, accountId))).get()
    if (!existing) return false
    await this.orm.delete(projectMembersTable).where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.accountId, accountId))).run()
    return true
  }

  async createInvitation(invitation: ProjectInvitation) {
    await this.orm.insert(projectInvitationsTable).values({ id: invitation.id, projectId: invitation.projectId, projectSlug: invitation.projectSlug, inviterId: invitation.inviterId, inviteeId: invitation.inviteeId, email: invitation.email, role: invitation.role, status: invitation.status, createdAt: invitation.createdAt }).run()
  }
  async listInvitations(accountId: string, email: string) {
    return await this.orm.select().from(projectInvitationsTable).where(and(eq(projectInvitationsTable.status, 'pending'), or(eq(projectInvitationsTable.inviteeId, accountId), eq(projectInvitationsTable.email, email.toLowerCase())))).orderBy(desc(projectInvitationsTable.createdAt)).all() as ProjectInvitation[]
  }
  async respondInvitation(id: string, accountId: string, status: 'accepted' | 'declined') {
    const invitation = await this.orm.select().from(projectInvitationsTable).where(and(eq(projectInvitationsTable.id, id), eq(projectInvitationsTable.status, 'pending'))).get() as ProjectInvitation | null
    if (!invitation || (invitation.inviteeId && invitation.inviteeId !== accountId)) return false
    await this.orm.update(projectInvitationsTable).set({ status }).where(eq(projectInvitationsTable.id, id)).run()
    if (status === 'accepted') await this.setProjectMember(invitation.projectId, accountId, invitation.role)
    return true
  }
  async createNotification(notification: SiteNotification) {
    await this.orm.insert(notificationsTable).values({ id: notification.id, accountId: notification.accountId, type: notification.type, title: notification.title, body: notification.body, data: JSON.stringify(notification.data), readAt: notification.readAt, createdAt: notification.createdAt }).run()
  }
  async listNotifications(accountId: string) {
    const rows = await this.orm.select().from(notificationsTable).where(eq(notificationsTable.accountId, accountId)).orderBy(desc(notificationsTable.createdAt)).limit(100).all()
    return rows.map((item: { data: string }) => ({ ...item, data: JSON.parse(item.data) as Record<string, unknown> })) as SiteNotification[]
  }
  async markNotificationRead(accountId: string, id: string) {
    const existing = await this.orm.select({ id: notificationsTable.id }).from(notificationsTable).where(and(eq(notificationsTable.id, id), eq(notificationsTable.accountId, accountId))).get()
    if (!existing) return false
    await this.orm.update(notificationsTable).set({ readAt: new Date().toISOString() }).where(eq(notificationsTable.id, id)).run()
    return true
  }
  async isProjectFavorite(accountId: string, projectSlug: string) {
    return Boolean(await this.orm.select({ accountId: projectFavoritesTable.accountId }).from(projectFavoritesTable).where(and(eq(projectFavoritesTable.accountId, accountId), eq(projectFavoritesTable.projectSlug, projectSlug))).get())
  }
  async setProjectFavorite(accountId: string, projectSlug: string, favorite: boolean) {
    const orm = this.orm
    if (favorite) await orm.insert(projectFavoritesTable).values({ accountId, projectSlug, createdAt: new Date().toISOString() }).onConflictDoNothing().run()
    else await orm.delete(projectFavoritesTable).where(and(eq(projectFavoritesTable.accountId, accountId), eq(projectFavoritesTable.projectSlug, projectSlug))).run()
    return favorite
  }
  async listProjectFavorites(accountId: string) {
    return await this.orm.select({ accountId: projectFavoritesTable.accountId, projectSlug: projectFavoritesTable.projectSlug, createdAt: projectFavoritesTable.createdAt }).from(projectFavoritesTable).where(eq(projectFavoritesTable.accountId, accountId)).orderBy(desc(projectFavoritesTable.createdAt)).all() as ProjectFavorite[]
  }
  async getProjectEngagement(projectSlug: string) {
    const orm = this.orm
    const downloads = await orm.select({ value: count() }).from(downloadEventsTable).where(eq(downloadEventsTable.projectSlug, projectSlug)).get()
    const favorites = await orm.select({ value: count() }).from(projectFavoritesTable).where(eq(projectFavoritesTable.projectSlug, projectSlug)).get()
    return { downloads: Number(downloads?.value ?? 0), favorites: Number(favorites?.value ?? 0) }
  }
  async recordDownload(event: DownloadEvent) {
    await this.orm.insert(downloadEventsTable).values({ id: event.id, projectSlug: event.projectSlug, fileId: event.fileId, versionId: event.versionId, accountId: event.accountId, source: event.source, createdAt: event.createdAt }).run()
  }
  async getDashboardStats(projectSlugs?: string[]) {
    if (projectSlugs && projectSlugs.length === 0) return { downloads: 0, favorites: 0, topDownloads: [], topFavorites: [] }
    const orm = this.orm
    const downloadWhere = projectSlugs?.length ? inArray(downloadEventsTable.projectSlug, projectSlugs) : undefined
    const favoriteWhere = projectSlugs?.length ? inArray(projectFavoritesTable.projectSlug, projectSlugs) : undefined
    const downloads = await orm.select({ value: count() }).from(downloadEventsTable).where(downloadWhere).get()
    const favorites = await orm.select({ value: count() }).from(projectFavoritesTable).where(favoriteWhere).get()
    const topDownloads = await orm.select({ projectSlug: downloadEventsTable.projectSlug, value: count() }).from(downloadEventsTable).where(downloadWhere).groupBy(downloadEventsTable.projectSlug).orderBy(desc(count())).limit(5).all()
    const topFavorites = await orm.select({ projectSlug: projectFavoritesTable.projectSlug, value: count() }).from(projectFavoritesTable).where(favoriteWhere).groupBy(projectFavoritesTable.projectSlug).orderBy(desc(count())).limit(5).all()
    return { downloads: Number(downloads?.value ?? 0), favorites: Number(favorites?.value ?? 0), topDownloads: topDownloads.map((item: { projectSlug: string; value: number }) => ({ projectSlug: item.projectSlug, count: Number(item.value) })), topFavorites: topFavorites.map((item: { projectSlug: string; value: number }) => ({ projectSlug: item.projectSlug, count: Number(item.value) })) }
  }
  async getAppSetting(key: string) {
    try {
      const row = await this.orm.select({ value: appMetaTable.value }).from(appMetaTable).where(eq(appMetaTable.key, key)).get()
      return row?.value ?? null
    } catch { return null }
  }
  async setAppSetting(key: string, value: string) {
    await this.orm.insert(appMetaTable).values({ key, value, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: appMetaTable.key, set: { value, updatedAt: new Date().toISOString() } }).run()
  }
  async createYggSession(session: YggSessionRecord) { await this.orm.insert(yggSessionsTable).values({ id: session.id, accountId: session.accountId, profileId: session.profileId, serverId: session.serverId, ip: session.ip, createdAt: session.createdAt, expiresAt: session.expiresAt }).run() }
  async hasYggSession(profileId: string, serverId: string) { const now = new Date().toISOString(); const orm = this.orm; await orm.delete(yggSessionsTable).where(lte(yggSessionsTable.expiresAt, now)).run(); const row = await orm.select({ id: yggSessionsTable.id }).from(yggSessionsTable).where(and(eq(yggSessionsTable.profileId, profileId), eq(yggSessionsTable.serverId, serverId), gt(yggSessionsTable.expiresAt, now))).limit(1).get(); return Boolean(row) }
  async revokeYggToken(tokenHash: string, accountId: string | null, revokedAt: string, expiresAt: string | null) { await this.orm.insert(yggRevokedTokensTable).values({ tokenHash, accountId, revokedAt, expiresAt }).onConflictDoNothing().run() }
  async isYggTokenRevoked(tokenHash: string) { const now = new Date().toISOString(); const row = await this.orm.select({ tokenHash: yggRevokedTokensTable.tokenHash }).from(yggRevokedTokensTable).where(and(eq(yggRevokedTokensTable.tokenHash, tokenHash), or(isNull(yggRevokedTokensTable.expiresAt), gt(yggRevokedTokensTable.expiresAt, now)))).get(); return Boolean(row) }
  async saveMojangToken(accountId: string, ciphertext: string, updatedAt: string, expiresAt: string | null) { await this.orm.insert(mojangOauthTokensTable).values({ accountId, refreshTokenCiphertext: ciphertext, createdAt: updatedAt, updatedAt, expiresAt }).onConflictDoUpdate({ target: mojangOauthTokensTable.accountId, set: { refreshTokenCiphertext: ciphertext, updatedAt, expiresAt } }).run() }
  async createPublishUpload(upload: PublishUploadRecord) { await this.orm.insert(publishUploadsTable).values({ id: upload.id, projectSlug: upload.projectSlug, accountId: upload.accountId, filename: upload.filename, size: upload.size, sha256: upload.sha256, contentType: upload.contentType, storageKey: upload.storageKey, multipartId: upload.multipartId, status: upload.status, createdAt: upload.createdAt, expiresAt: upload.expiresAt }).run() }
  async getPublishUpload(id: string, accountId: string) { return (await this.orm.select().from(publishUploadsTable).where(and(eq(publishUploadsTable.id, id), eq(publishUploadsTable.accountId, accountId))).get() as PublishUploadRecord | undefined) ?? null }
  async getCompletedPublishUpload(id: string, accountId: string, projectSlug: string) { return (await this.orm.select().from(publishUploadsTable).where(and(eq(publishUploadsTable.id, id), eq(publishUploadsTable.accountId, accountId), eq(publishUploadsTable.projectSlug, projectSlug), eq(publishUploadsTable.status, 'complete'))).get() as PublishUploadRecord | undefined) ?? null }
  async completePublishUpload(id: string) { await this.orm.update(publishUploadsTable).set({ status: 'complete' }).where(eq(publishUploadsTable.id, id)).run() }

  async findAccountByEmail(email: string) {
    const account = await this.orm.select().from(accountsTable).where(eq(accountsTable.email, email)).get() as any
    return account ? { ...account, metadata: account.metadataJson ? JSON.parse(account.metadataJson) as AccountMetadata : {} } : null
  }

  async getAccount(id: string) {
    const account = await this.orm.select().from(accountsTable).where(eq(accountsTable.id, id)).get() as any
    return account ? { ...account, metadata: account.metadataJson ? JSON.parse(account.metadataJson) as AccountMetadata : {} } : null
  }

  async createAccount(account: AccountRecord) {
    await this.orm.insert(accountsTable).values({ id: account.id, email: account.email, passwordHash: account.passwordHash, createdAt: account.createdAt, verifiedAt: account.verifiedAt, role: account.role, metadataJson: JSON.stringify(account.metadata ?? {}) }).run()
  }

  async createSession(session: SessionRecord) {
    await this.orm.insert(sessionsTable).values({ idHash: session.idHash, accountId: session.accountId, expiresAt: session.expiresAt }).run()
  }

  async getSession(idHash: string) {
    const session = await this.orm.select().from(sessionsTable).where(eq(sessionsTable.idHash, idHash)).get() as SessionRecord | undefined
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (session) await this.deleteSession(idHash)
      return null
    }
    return session
  }

  async deleteSession(idHash: string) {
    await this.orm.delete(sessionsTable).where(eq(sessionsTable.idHash, idHash)).run()
  }

}
