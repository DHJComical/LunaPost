import { z } from 'zod'
import { validRange } from 'semver'
export * from './dependencies.js'

export const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(['github_release', 'custom_http', 'managed', 'cdn']),
  region: z.string().default('GLOBAL'),
  url: z.string().url().refine((url) => ['https:', 'http:'].includes(new URL(url).protocol), 'Expected an HTTP(S) download URL'),
  priority: z.number().int().default(0),
})

// A project CDN rule expands into a source for every file in a matching project.
// Supported placeholders in template: {fileId}, {filename}, {projectSlug},
// {versionId}, and {version}.
export const cdnRuleSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(120),
  template: z.string().trim().min(1).max(500),
  region: z.string().trim().min(1).max(24).default('GLOBAL'),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
})

export const donationSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  url: z.string().url(),
})

export const projectLinkSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(120),
  url: z.string().url(),
  icon: z.string().trim().max(40).optional(),
  group: z.string().trim().max(40).optional(),
  embed: z.boolean().optional(),
  embedHeight: z.number().int().min(160).max(1600).optional(),
})

export const externalDependencySchema = z.object({
  provider: z.enum(['modrinth', 'curseforge']),
  projectId: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  versionId: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).superRefine((ref, ctx) => {
  if (ref.provider === 'curseforge' && (!/^\d+$/.test(ref.projectId) || (ref.versionId && !/^\d+$/.test(ref.versionId)))) ctx.addIssue({ code: 'custom', message: 'CurseForge requires numeric project and file IDs' })
})
export type ExternalDependency = z.infer<typeof externalDependencySchema>

export const dependencySchema = z.object({
  external: externalDependencySchema.optional(),
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  fileName: z.string().min(1).optional(),
  id: z.string().optional(),
  dependencyType: z.enum(['required', 'optional', 'recommended', 'integration', 'incompatible', 'embedded']).default('required'),
  reason: z.string().max(2000).optional(),
  versionConstraint: z.discriminatedUnion('scheme', [
    z.object({ scheme: z.literal('semver'), range: z.string().max(200).refine(value => Boolean(validRange(value)), 'Invalid SemVer range') }),
    z.object({ scheme: z.literal('exact'), versions: z.array(z.string().min(1)).min(1).max(100) }),
  ]).optional(),
  appliesTo: z.object({ loaders: z.array(z.string()).optional(), gameVersions: z.array(z.string()).optional(), side: z.enum(['client', 'server', 'both']).optional(), loaderRange: z.string().max(200).refine(value => Boolean(validRange(value)), 'Invalid loader range').optional() }).optional(),
  when: z.object({ installedProjectIds: z.array(z.string()).optional(), feature: z.string().optional() }).optional(),
}).superRefine((d, ctx) => {
  if (d.external && (d.projectId || d.versionId || d.fileName)) ctx.addIssue({ code: 'custom', message: 'Choose either a local or an external dependency target' })
})

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().max(20_000).optional(),
  size: z.number().int().nonnegative().optional(),
  sha1: z.string().regex(/^[a-fA-F0-9]{40}$/).optional(),
  sha512: z.string().regex(/^[a-fA-F0-9]{128}$/).optional(),
  primary: z.boolean().default(false),
  fileType: z.enum(['required-resource-pack', 'optional-resource-pack', 'mod', 'source-jar', 'unknown']).default('unknown'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  reviewStatus: z.enum(['approved', 'pending', 'rejected']).default('approved'),
  reviewNote: z.string().max(2_000).optional(),
  reviewedAt: z.string().datetime().optional(),
  reviewedBy: z.string().optional(),
  sources: z.array(sourceSchema),
})

export const versionSchema = z.object({
  id: z.string(),
  version: z.string(),
  type: z.enum(['release', 'beta', 'alpha']),
  gameVersions: z.array(z.string()),
  loaders: z.array(z.string()),
  loaderBridges: z.array(z.object({
    fromLoader: z.string().min(1),
    fromLoaderVersion: z.string().optional(),
    toLoader: z.string().min(1),
    viaProjectId: z.string().min(1),
    viaVersionId: z.string().optional(),
    viaRange: z.string().max(200).refine(value => Boolean(validRange(value)), 'Invalid bridge version range').optional(),
    gameVersions: z.array(z.string()).optional(),
    side: z.enum(['client', 'server', 'both']).optional(),
    reason: z.string().max(2000).optional(),
  })).max(20).optional(),
  featured: z.boolean().default(false),
  status: z.enum(['listed', 'archived', 'draft', 'unlisted']).default('listed'),
  dependencies: z.array(dependencySchema).max(200).default([]),
  changelog: z.string().optional(),
  description: z.string().max(100_000).optional(),
  changelogUrl: z.string().url().optional(),
  publishedAt: z.string().datetime().optional(),
  files: z.array(fileSchema),
})

export const licenseRecordSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  spdx: z.string().optional(),
  url: z.string().url().optional(),
  fileName: z.string().optional(),
  text: z.string().max(2_000_000).optional(),
})
export type LicenseRecord = z.infer<typeof licenseRecordSchema>

const assetUrlSchema = z.string().refine((value) => value.startsWith('/') || ['https:', 'http:'].includes(new URL(value).protocol), 'Expected an HTTP(S) URL or local asset path')

export const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  ownerId: z.string().optional(),
  ownerType: z.enum(['account', 'organization']).default('account'),
  title: z.string(),
  type: z.enum(['mod', 'modpack', 'resourcepack', 'shader', 'plugin', 'tool']),
  description: z.string(),
  body: z.string().max(1_000_000).optional(),
  categories: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  clientSide: z.enum(['required', 'optional', 'unsupported', 'unknown']).default('unknown'),
  serverSide: z.enum(['required', 'optional', 'unsupported', 'unknown']).default('unknown'),
  status: z.enum(['approved', 'pending', 'rejected', 'draft', 'archived']).default('approved'),
  featured: z.boolean().default(false),
  downloads: z.number().int().nonnegative().default(0),
  followers: z.number().int().nonnegative().default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  iconUrl: assetUrlSchema.optional(),
  iconUrls: z.array(assetUrlSchema).default([]),
  repositoryUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  issuesUrl: z.string().url().optional(),
  discordUrl: z.string().url().optional(),
  cdnRules: z.array(cdnRuleSchema).default([]),
  donationUrls: z.array(donationSchema).default([]),
  links: z.array(projectLinkSchema).default([]),
  homepageHtml: z.string().max(500_000).optional(),
  wikiHtml: z.string().max(500_000).optional(),
  wikiUrl: z.string().url().optional(),
  gallery: z.array(z.string().url()).default([]),
  license: z.string().optional(),
  licenses: z.array(licenseRecordSchema).default([]),
  loaders: z.array(z.string()),
  gameVersions: z.array(z.string()),
  versions: z.array(versionSchema),
})

export const catalogSchema = z.object({
  schemaVersion: z.number().int().positive(),
  catalogRevision: z.string(),
  generatedAt: z.string(),
  projects: z.array(projectSchema),
}).superRefine((catalog, ctx) => {
  const ids = new Set<string>()
  for (const project of catalog.projects) {
    for (const version of project.versions) {
      for (const file of version.files) {
        if (ids.has(file.id)) ctx.addIssue({ code: 'custom', message: `Duplicate file id: ${file.id}` })
        ids.add(file.id)
      }
    }
  }
})

// A file id identifies one immutable artifact; mirrors may change without changing this URL.
export const stableDownloadPath = (fileId: string) => `/api/v1/files/${encodeURIComponent(fileId)}/download`

export const launcherFile = (file: FileRecord, origin: string, sources: Source[] = file.sources) => ({
  id: file.id,
  filename: file.name,
  description: file.description ?? null,
  size: file.size ?? null,
  hashes: { ...(file.sha1 ? { sha1: file.sha1.toLowerCase() } : {}), ...(file.sha512 ? { sha512: file.sha512.toLowerCase() } : {}) },
  url: new URL(stableDownloadPath(file.id), origin).href,
  sources: sources.map((source) => ({ id: source.id, kind: source.kind, region: source.region, url: source.url, priority: source.priority })),
  primary: file.primary,
})

export const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().max(128).optional(),
})

export const loginSchema = registerSchema

export const setupInitializeSchema = z.object({
  token: z.string().max(256).optional(),
  siteName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type SetupInitializeInput = z.infer<typeof setupInitializeSchema>

export type Source = z.infer<typeof sourceSchema>
export type CdnRule = z.infer<typeof cdnRuleSchema>
export type Donation = z.infer<typeof donationSchema>
export type ProjectLink = z.infer<typeof projectLinkSchema>
export type Dependency = z.infer<typeof dependencySchema>
export type FileRecord = z.infer<typeof fileSchema>
export type Version = z.infer<typeof versionSchema>
export type Project = z.infer<typeof projectSchema>
export type Catalog = z.infer<typeof catalogSchema>

export type DownloadSelection = {
  file: FileRecord
  selected: Source
  mirrors: Source[]
}

export type ModerationPolicy = 'none' | 'automatic' | 'full'
export type ModerationFailMode = 'manual' | 'reject'
export type GitHubActionsCacheSettings = {
  sharedEnabled: boolean
  proxyEnabled: boolean
  ttlSeconds: number
  apiKey: string
}
export type StorageProviderSettings = {
  id?: string
  name?: string
  enabled?: boolean
  primary?: boolean
  priority?: number
  provider: 'r2' | 'tencent_cos'
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  pathPrefix: string
}
export type StorageSyncMode = 'manual' | 'automatic'
export type StorageDirectUploadRole = 'user' | 'developer' | 'admin' | 'root'
export type StorageDirectUploadSettings = {
  enabled: boolean
  roles: StorageDirectUploadRole[]
  ttlSeconds: number
}
export type StorageSettings = StorageProviderSettings & {
  syncMode: StorageSyncMode
  providers: StorageProviderSettings[]
  directUpload: StorageDirectUploadSettings
}
export type SiteSettings = {
  appearance: {
    roundedProjectIcons: boolean
    siteName: string
    siteIconUrl: string
  }
  moderation: {
    projectCreation: ModerationPolicy
    fileSubmission: ModerationPolicy
    automatic: {
      externalApiUrl?: string
      failMode: ModerationFailMode
      maxFileSize: number
      blockedExtensions: string[]
      requireHashes: boolean
      requireSource: boolean
    }
  }
  registration: {
    enabled: boolean
    requireInviteCode: boolean
    requireApproval: boolean
    inviteCodes: string[]
  }
  ygg: {
    enabled: boolean
    allowLocalAccounts: boolean
    accessTokenTtlSeconds: number
    refreshTokenTtlSeconds: number
    upstreams: Array<{
      id: string
      name: string
      baseUrl: string
      authBaseUrl?: string
      sessionBaseUrl?: string
      profileBaseUrl?: string
      nameLookupBaseUrl?: string
      enabled: boolean
      priority: number
    }>
  }
  mojang: {
    enabled: boolean
    clientId: string
    tenant: 'consumers' | 'common' | 'organizations'
  }
  githubActions: GitHubActionsCacheSettings
  storage: StorageSettings
}

export type AccountView = {
  id: string
  email: string
  createdAt: string
  verifiedAt: string | null
  role: 'user' | 'developer' | 'admin' | 'root'
  metadata: AccountMetadata
}

export const accountMetadataSchema = z.object({
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_.-]+$/u).optional(),
  displayName: z.string().trim().max(120).optional(),
  bio: z.string().max(2_000).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  githubUrl: z.string().url().nullable().optional(),
  location: z.string().trim().max(120).optional(),
  links: z.array(projectLinkSchema).max(20).optional(),
  minecraftUuid: z.string().regex(/^[0-9a-fA-F]{32}$/u).optional(),
  skinUrl: z.string().url().nullable().optional(),
  capeUrl: z.string().url().nullable().optional(),
  uuidSource: z.enum(['local', 'mojang', 'upstream']).optional(),
}).default({})

export type AccountMetadata = z.infer<typeof accountMetadataSchema>

export const organizationSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).default(''),
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: z.string().datetime(),
  ownerId: z.string(),
})

export type Organization = z.infer<typeof organizationSchema>



