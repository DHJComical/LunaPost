import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { randomBytes } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const envPath = resolve(root, '.env')
const args = new Map()

for (let index = 2; index < process.argv.length; index += 1) {
  const item = process.argv[index]
  if (!item.startsWith('--')) continue
  const [key, inlineValue] = item.slice(2).split('=', 2)
  const next = process.argv[index + 1]
  const value = inlineValue ?? (next && !next.startsWith('--') ? next : 'true')
  args.set(key, value)
  if (inlineValue === undefined && next && !next.startsWith('--')) index += 1
}

const nonInteractive = args.get('non-interactive') === 'true'
const defaults = {
  mode: args.get('mode') ?? 'self-hosted',
  database: args.get('database') ?? 'sqlite',
  publicUrl: args.get('public-url') ?? 'http://localhost:8787',
  webUrl: args.get('web-url') ?? 'http://localhost:9000',
  authDbPath: args.get('auth-db-path') ?? './data/auth.sqlite',
}

const allowed = (value, choices, fallback) => choices.includes(value) ? value : fallback
const ask = async (rl, question, fallback) => {
  const answer = (await rl.question(`${question} [${fallback}]: `)).trim()
  return answer || fallback
}

const rl = nonInteractive ? null : createInterface({ input, output })
try {
  const mode = allowed(nonInteractive ? defaults.mode : await ask(rl, '部署模式（self-hosted/cloud/static-plus-api）', defaults.mode), ['self-hosted', 'cloud', 'static-plus-api'], 'self-hosted')
  const database = allowed(nonInteractive ? defaults.database : await ask(rl, '数据库（sqlite/postgres/d1）', defaults.database), ['sqlite', 'postgres', 'd1'], 'sqlite')
  const publicUrl = nonInteractive ? defaults.publicUrl : await ask(rl, 'API 公共地址', defaults.publicUrl)
  const webUrl = nonInteractive ? defaults.webUrl : await ask(rl, '前端地址', defaults.webUrl)
  const authDbPath = database === 'sqlite'
    ? (nonInteractive ? defaults.authDbPath : await ask(rl, 'SQLite 数据库路径', defaults.authDbPath))
    : defaults.authDbPath

  const envLines = [
    `APP_MODE=${mode}`,
    `DATABASE_DRIVER=${database}`,
    'API_PORT=8787',
    `PUBLIC_BASE_URL=${publicUrl}`,
    `CORS_ORIGINS=${webUrl}`,
    `AUTH_DB_PATH=${authDbPath}`,
    'SETUP_TOKEN=',
    `JWT_SECRET=${randomBytes(32).toString('base64url')}`,
  ]
  if (database === 'postgres') envLines.push('DATABASE_URL=postgres://modpost:change-me@127.0.0.1:5432/modpost')
  if (database === 'd1') envLines.push('D1_DATABASE_NAME=andrea-modpost')

  if (existsSync(envPath) && !nonInteractive) {
    const replace = (await ask(rl, `${envPath} 已存在，覆盖它吗（yes/no）`, 'no')).toLowerCase()
    if (replace !== 'yes' && replace !== 'y') {
      console.log('保留现有 .env。')
    } else {
      writeFileSync(envPath, `${envLines.join('\n')}\n`, 'utf8')
    }
  } else {
    writeFileSync(envPath, `${envLines.join('\n')}\n`, 'utf8')
  }

  if (database === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite')
    const dbPath = resolve(root, authDbPath)
    mkdirSync(dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)
    db.exec(`
      PRAGMA foreign_keys = ON;
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
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_id TEXT REFERENCES accounts(id),
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
      CREATE TABLE IF NOT EXISTS project_members (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY(project_id, account_id)
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
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS project_documents (
        slug TEXT PRIMARY KEY,
        project_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
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
    `)
    // Keep the bootstrap database aligned with the runtime Drizzle schema and
    // the latest migrations. SqliteAccountStore repeats these CREATE IF NOT
    // EXISTS statements, so this remains safe for existing installations.
    db.exec(`
      CREATE TABLE IF NOT EXISTS ygg_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        ip TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ygg_sessions_lookup_idx ON ygg_sessions(profile_id, server_id, expires_at);
      CREATE TABLE IF NOT EXISTS ygg_revoked_tokens (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        revoked_at TEXT NOT NULL,
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ygg_revoked_tokens_expiry_idx ON ygg_revoked_tokens(expires_at);
      CREATE TABLE IF NOT EXISTS mojang_oauth_tokens (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        refresh_token_ciphertext TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT
      );
      CREATE TABLE IF NOT EXISTS project_publish_tokens (
        id TEXT PRIMARY KEY,
        project_slug TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '["release:write"]',
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS project_publish_tokens_project_idx ON project_publish_tokens(project_slug, revoked_at);
      CREATE TABLE IF NOT EXISTS publish_uploads (
        id TEXT PRIMARY KEY,
        project_slug TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT,
        content_type TEXT NOT NULL,
        storage_key TEXT,
        multipart_id TEXT,
        status TEXT NOT NULL DEFAULT 'created',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS publish_uploads_expiry_idx ON publish_uploads(status, expires_at);
    `)
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('schema_version', '10', ?)").run(new Date().toISOString())
    db.close()
    console.log(`SQLite 数据库已初始化：${dbPath}`)
  }

  if (database === 'postgres') {
    console.log('PostgreSQL 已生成配置。请先设置 DATABASE_URL，再执行 migrations/0001_auth.sql 和 migrations/0002_core.sql。')
  }

  if (database === 'd1') {
    console.log('D1 已生成配置。请使用 Wrangler 将 migrations/0001_auth.sql 和 migrations/0002_core.sql 应用到目标数据库。')
  }

  console.log(`初始化完成，配置文件：${envPath}`)
  console.log('启动 API：pnpm dev:api')
  console.log('启动前端：pnpm dev:web')
} finally {
  rl?.close()
}
