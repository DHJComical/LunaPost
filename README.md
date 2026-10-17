# Andrea Modpost

面向 Mod、Modpack、资源包、插件和工具的可自托管项目发布平台。提供项目/版本/文件托管、稳定下载路由、多镜像选择、依赖解析、Modrinth 兼容 API、内容审核，以及可选的 Minecraft 身份（Mojang / Yggdrasil）集成。

技术形态是 pnpm monorepo：Vue 3 + Quasar 前端、Hono API（Node 与 Cloudflare Worker 双入口）、Zod 共享契约，以及可静态导出的 Catalog。

## 功能概览

- **项目发布**：项目元数据（分类、关键词、客户端/服务端环境、社区链接、画廊、许可证）、多版本、多文件、多下载源
- **稳定下载**：`/api/v1/files/:fileId/download` 不随镜像切换而变化，按区域与 `cdnRules[]` 自动选源
- **自动发布**：GitHub Actions 发布 API 的认证、上传、幂等和版本提交契约见 [`docs/github-actions-publish-api.md`](docs/github-actions-publish-api.md)
- **依赖解析**：站内依赖与 Modrinth / CurseForge 外部依赖，SemVer / exact 约束，安装清单解析
- **启动器兼容**：Modrinth API v2 只读兼容层（`/v2` 与 `/api/modrinth/v2`）
- **账户与组织**：注册/登录、JWT 会话、API Key、公开资料、组织与项目协作角色、邀请与站内通知、收藏夹
- **内容审核**：项目创建与文件提交可分别配置 `none` / `automatic` / `full`，支持外部自动审核 API 与人工队列
- **站点设置**：站点名称/图标、注册策略（开放注册、邀请码、注册后审核）、外观选项
- **Minecraft 身份**：Microsoft 设备码绑定官方档案；可选 Yggdrasil 认证代理（含上游聚合与皮肤签名）
- **静态部署**：由 `catalog/catalog.json` 生成 `/api/v1/*.json` 与 `/catalog.json`，前端可纯静态托管
- **多语言与主题**：内置 `zh-CN` / `en-US`，主题支持 `system` / `light` / `dark`

## 仓库结构

```text
.
├─ apps/
│  ├─ web/                 # Vue 3 + Vite + Quasar 前端
│  │  ├─ src/pages/        # Discover、项目页、编辑器、后台、账户、Setup 等
│  │  ├─ src/components/   # Discover、依赖编辑、代码编辑器等组件
│  │  └─ tests/            # Markdown / 浏览器检查脚本
│  └─ api/                 # Hono API
│     ├─ src/app.ts        # 业务路由（鉴权、项目、账户、后台、依赖）
│     ├─ src/node.ts       # Node 自托管入口（node:sqlite + 本地文件存储）
│     ├─ src/worker.ts     # Cloudflare Worker 入口（D1 + R2）
│     ├─ src/downloads.ts  # 稳定下载与镜像选择
│     ├─ src/modrinth-compat.ts
│     ├─ src/external-dependencies.ts  # Modrinth/CurseForge 外部依赖
│     ├─ src/mojang.ts     # Microsoft 设备码绑定
│     └─ src/ygg.ts        # Yggdrasil 认证 / 会话 / 皮肤接口
├─ packages/contracts/     # Zod schema、Catalog 类型、依赖解析
├─ catalog/catalog.json    # 示例与静态构建源数据
├─ migrations/             # D1 / PostgreSQL 迁移（0001–0009）
├─ scripts/                # 初始化助手、Catalog/静态构建
├─ deploy/workerd/         # 本地 workerd 自托管配置
└─ docs/                   # 架构、依赖、Markdown 渲染文档
```

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3、Vite、Quasar、Pinia、Vue Router、Monaco Editor（可选） |
| Markdown | Marked（GFM）+ DOMPurify + highlight.js |
| API | Hono；Node（`@hono/node-server`）与 Cloudflare Workers 双入口 |
| 存储 | SQLite（`node:sqlite`）/ D1 / PostgreSQL；本地目录或 R2 存文件 |
| 契约 | Zod（`@andrea/contracts`） |

## 快速开始

要求 Node.js 22+（使用内置 `node:sqlite`）与 pnpm 10。

```powershell
pnpm install
pnpm dev:api     # API 默认 http://localhost:8787
pnpm dev:web     # 前端默认 http://localhost:9000
```

打开 <http://localhost:9000>。首次使用建议访问 <http://localhost:9000/setup> 完成站点名称和首个管理员账户初始化；也可以用初始化助手写配置：

```powershell
pnpm modpost:setup
```

它会引导配置部署模式、数据库、公共 URL、CORS，并在 SQLite 模式下创建账户与 Session 表。CI 或脚本可使用非交互模式：

```powershell
pnpm modpost:db:init -- --mode self-hosted --database sqlite --public-url http://localhost:8787 --web-url http://localhost:9000 --auth-db-path ./data/auth.sqlite
```

初始化助手会生成根目录 `.env`，Node API 启动时自动加载。生产环境请把 `.env` 放入密钥管理系统，不要提交到 Git。

初始化接口只允许在数据库没有账户时调用；若设置了 `SETUP_TOKEN`，Setup 页面会要求输入初始化令牌。

### 环境变量

参考 `.env.example`：

| 变量 | 说明 |
| --- | --- |
| `API_PORT` | API 监听端口（默认 `8787`） |
| `CORS_ORIGINS` | 允许的前端来源 |
| `AUTH_DB_PATH` | SQLite 账户库路径（默认 `./data/auth.sqlite`） |
| `STORAGE_DIR` | Node 本地文件目录（默认 `./data/files`） |
| `CATALOG_JSON_PATH` | Catalog JSON 路径（默认 `catalog/catalog.json`） |
| `PUBLIC_BASE_URL` | 对外 API 根地址，用于生成稳定下载链接 |
| `JWT_SECRET` | HS256 JWT 密钥，初始化助手会生成随机值 |
| `SETUP_TOKEN` | 可选，Setup 初始化令牌 |
| `MODERATION_API_TOKEN` | 可选，自动审核 API 的 Bearer 凭证 |
| `YGG_TEXTURE_PRIVATE_KEY` / `YGG_TEXTURE_PUBLIC_KEY` | 可选，Ygg 皮肤属性签名用 PKCS#8 RSA 密钥 |
| `MICROSOFT_CLIENT_ID` / `OAUTH_ENCRYPTION_KEY` | 可选，Microsoft/Mojang 绑定 |
| `CURSEFORGE_API_KEY` | 可选，外部依赖查询 CurseForge 时必需 |

Worker 部署时通过绑定注入等价配置（如 `STORAGE` 指向 R2、D1 数据库绑定）。

后台的“文件存储”设置支持一个主存储和多个镜像存储。当前提供 `r2`（使用 Worker 的 `STORAGE` binding）和 `tencent_cos`（填写 endpoint、region、bucket、密钥）两种适配器；旧版单存储配置会自动迁移为一个主存储。`syncMode` 设为 `automatic` 时，上传先写入主存储，再通过 Worker 的 `waitUntil` 异步复制到所有启用镜像；设为 `manual` 时不会自动复制。

管理员可以调用下面的接口补齐镜像，支持单对象、多个对象或整个项目的托管文件：

```text
POST /api/v1/admin/storage/sync
{ "key": "publish/example/…/file.jar" }
{ "projectSlug": "example", "providerIds": ["cos-apac"] }
GET  /api/v1/admin/storage/sync?key=publish/example/…/file.jar
```

同步记录保存在站点设置中，包含每个镜像的 `synced`/`failed` 状态和时间。私有桶请留空 `publicBaseUrl`，下载接口会返回对象存储的短期签名地址，文件字节不会经过 Worker。

浏览器直传目前支持腾讯 COS，必须将配置完整的 COS 设为**主存储**，并在直传设置中启用相应用户组。R2 binding 和本地磁盘不提供预签名上传地址。COS 桶保持私有即可；桶的 CORS 规则需允许站点来源（例如 `https://lunapost.sirrus.cc`）、`PUT` 方法和 `Content-Type` 请求头。浏览器向 COS 上传，本站仅签发 URL 并通过 HEAD 确认上传完成。`DIRECT_UPLOAD_UNAVAILABLE` 表示角色未开放直传或主存储不支持；`DIRECT_UPLOAD_SIGNING_FAILED` 表示生成签名失败，此时前端不会自动退回经 Worker 上传。后台主存储表单的修改会同步保存到主存储条目；多存储 JSON 中独立修改的镜像仍会保留。

## 账户与权限

登录使用 HS256 JWT：浏览器侧保存在 HttpOnly Cookie，API 客户端也可以用登录响应中的 `accessToken` 走 `Authorization: Bearer <token>`。JWT 过期后，只要长期 Session 仍有效，`GET /api/v1/me` 会自动续发短期令牌。

全局角色：`user` < `developer` < `admin` < `root`。初始化创建的首个账户是 root；普通管理员可审核内容和改审核策略，只有 root 能管理 root 账户。当前登录管理员和最后一个管理员不能被删除或降级。

项目协作角色：`owner`、`admin`、`editor`、`reviewer`、`member`。组织成员角色：`owner`、`admin`、`member`。项目可归属于个人或组织；所有者/项目管理员可在项目编辑页按邮箱邀请成员，邀请进入对方账户页与站内通知。

账户公开资料包含用户名、显示名称、简介、头像、网站、GitHub、所在地和可扩展链接；公开主页使用稳定账户 ID（`/users/:id`）。组织主页为 `/organizations/:slug`。

常用入口：

| 页面 | 路径 |
| --- | --- |
| Discover 目录 | `/` |
| 项目详情 | `/projects/:slug/:tab?` |
| 登录 / 注册 | `/auth` |
| 站点初始化 | `/setup` |
| 开发者与管理后台 | `/admin` |
| 项目编辑器 | `/admin/projects/new`、`/admin/projects/:slug/edit` |
| 账户页 | `/account` |
| 开发者 API 文档 | `/api` |

账户页可编辑公开资料、创建组织、创建/吊销 API Key（令牌只在创建时返回一次）、管理收藏夹与通知，以及绑定 Minecraft 档案。语言保存在 `localStorage` 的 `andrea-locale`，主题保存在 `andrea-theme`。

## 项目与版本

项目编辑器按 Tab 分区：**基本信息 / 画廊 / 许可证 / 内容与链接 / 版本与文件 / CDN 与镜像 / 参与者**。版本区域支持可视化表单或 `versions JSON` 两种模式。

项目模型支持 Modrinth 风格元数据：`type`（`mod` / `modpack` / `resourcepack` / `shader` / `plugin` / `tool`）、`categories`、`keywords`、`clientSide`、`serverSide`、`status`、`featured`、`downloads`、`followers`、`color`、`body`、`sourceUrl`、`issuesUrl`、`discordUrl`、`donationUrls` 和可扩展的 `links[]`。

版本支持 `featured`、`status`、`changelog`、`changelogUrl`、`dependencies`、`loaderBridges`；文件支持 `fileType`、`sha1`/`sha512`、扩展 `metadata`、审核状态和任意数量的 `sources[]` 镜像。文件可外链，也可上传到本机 `data/files`（Worker 部署对应 R2，稳定地址 `/api/v1/storage/:id`）。

`cdnRules[]` 会按 URL 模板为每个文件生成额外镜像，模板支持 `{fileId}`、`{filename}`、`{projectSlug}`、`{versionId}`、`{version}`。

项目主页支持 `homepageHtml`（公开地址 `/api/v1/projects/:slug/site`，详情页用受限 iframe 展示）；`wikiHtml` / `wikiUrl` 提供内嵌或外链 Wiki；`gallery`、`iconUrls` 用于画廊与多图标。静态模式会直接用 iframe `srcdoc` 渲染主页，不依赖 API 的 `/site` 路由。

保存后，公开项目页、稳定下载 URL 和 Modrinth 兼容接口会立即使用新数据。存储在 `project_documents` 的项目会覆盖同 Slug 的 Catalog 项目。

## 依赖解析

依赖声明在 `versions[].dependencies`，支持站内目标（`projectId` / `versionId` / `fileName`）或外部目标（`external.provider` 为 `modrinth` 或 `curseforge`）。约束支持 SemVer range 或 `exact` 版本集合；`appliesTo` 限定加载器、游戏版本与 client/server 端；`when` 支持按已安装项目或启用特性条件生效。`dependencyType` 包括 `required`、`optional`、`recommended`、`integration`、`incompatible`、`embedded`。

外部依赖解析在服务端进行，请求有预算限制与响应大小上限；CurseForge 需要 `CURSEFORGE_API_KEY`。详细字段与解析语义见 [docs/dependencies.md](docs/dependencies.md)。

```text
GET  /api/v1/dependencies/external        # 外部依赖元数据
POST /api/v1/dependencies/preview         # 编辑器预览解析
POST /api/v1/dependencies/resolve         # 生成安装清单
GET  /api/v1/projects/:slug/versions/:versionId/dependencies
GET  /api/v1/projects/:slug/dependents
```

## 下载与镜像

```text
GET /api/v1/files/:fileId
GET /api/v1/files/:fileId/sources
GET /api/v1/files/:fileId/download        # 稳定下载地址
```

下载接口会根据请求区域和镜像优先级自动选择源；需要手动指定镜像时追加 `?source=<source-id>`。启动器应保存 `file.id`、`hashes`、`filename`、`size` 和稳定 `url`，不要保存 GitHub Release 等原始地址——平台可以在不改变文件 id 的情况下切换 GitHub、区域镜像或 R2 源。真实下载事件会写入 `download_events`，用于统计与后台指标。

## HTTP API

业务 API 前缀为 `/api/v1`，常用只读接口：

```text
GET    /api/v1/health
GET    /api/v1/catalog
GET    /api/v1/projects
GET    /api/v1/projects/:slug
GET    /api/v1/projects/:slug/versions
GET    /api/v1/projects/:slug/site
GET    /api/v1/users
GET    /api/v1/users/:id
GET    /api/v1/organizations
GET    /api/v1/organizations/:slug
GET    /api/v1/settings
GET    /api/v1/account/api-keys
POST   /api/v1/account/api-keys
DELETE /api/v1/account/api-keys/:id
```

鉴权与账户：`POST /api/v1/auth/register|login|logout`、`GET /api/v1/me`、`PATCH /api/v1/account/profile`、收藏（`GET/PUT/DELETE /api/v1/projects/:slug/favorite`）、邀请与通知等。

管理接口（管理员）：`GET/PUT /api/v1/admin/settings`、`GET /api/v1/admin/overview|accounts|projects|reviews`、审核 `POST /api/v1/admin/reviews/projects/:slug` 与 `POST /api/v1/admin/reviews/files/:fileId`、账户角色/验证/删除、数据库导出导入（`/api/v1/admin/database/*`）。公共目录、稳定下载和兼容 API 都会过滤未批准的项目与文件。

## 启动器兼容 API

服务端提供 Modrinth API v2 风格的只读兼容层，启动器可将 API 基地址指向：

```text
http://localhost:8787/v2
http://localhost:8787/api/modrinth/v2
```

支持：

```text
GET /project/:id
GET /project/:id/version
GET /version/:id
GET /version_file?hash=...
GET /search?query=...
GET /tag/game_version
GET /tag/loader
GET /tag/category
GET /tag/project_type
GET /tag/license
```

文件响应中的 `url` 是稳定的平台链接，例如 `.../api/v1/files/example-mod-1.0.0-jar/download`。

另外提供便于自定义启动器的解析接口：

```text
GET /api/v1/projects/:slug/resolve?game_version=1.21.1&loader=fabric
GET /api/v1/projects/:slug/download?game_version=1.21.1&loader=fabric
```

筛选条件对应多个版本时返回 `AMBIGUOUS_VERSION`，需调用方传 `version_id`；正式 Catalog 应为版本配置 `publishedAt`，以便确定性选择最新版本。文件不唯一时会返回 `AMBIGUOUS_FILE`。

## Minecraft 身份

- **Mojang / Microsoft 绑定**：账户页通过设备码流程登录 Microsoft，同步 `minecraftUuid`、皮肤与披风；需要在站点设置中启用并配置 Microsoft Client ID。
- **Yggdrasil 认证代理**：可选开启，提供 `/api/ygg/authserver/*`、`/api/ygg/sessionserver/*` 与档案查询接口，支持站内账户登录、上游聚合（按 `priority` 依次尝试）、令牌吊销与皮肤属性签名。认证请求会先匹配站内账户，失败后按优先级转发到正版兼容的 Yggdrasil/LittleSkin 上游；上游令牌会被包装成本站短期令牌，`join`、`validate`、`invalidate`、`hasJoined` 和档案请求会继续透明转发，因此同一 MC 服务端可以融合多种账户来源。相关设置在后台「Yggdrasil 认证」分区，数据表由 `migrations/0009_ygg.sql` 创建。

MC 服务端使用本站的融合验证时，把 `GET /api/ygg/meta` 的地址交给 authlib-injector；也可以读取 `GET /api/ygg/server-config` 获取完整配置。例如：

```text
java -javaagent:authlib-injector.jar=https://example.com/api/ygg/meta -jar server.jar
```

服务端仍应设置 `online-mode=true`，由 authlib-injector 接管认证。`/api/ygg/server-config` 会返回 metadata 地址、Java Agent 参数、服务端属性和当前启用的上游列表。后台上游的 `baseUrl` 应指向 Yggdrasil 服务根地址；需要拆分路由时可分别填写 `authBaseUrl`、`sessionBaseUrl`、`profileBaseUrl`、`nameLookupBaseUrl`。上游不可用时会继续尝试下一项，全部失败才返回认证失败。

例如，同时接受 LittleSkin 和正版玩家，可以在后台填写类似配置（正版的 `hasJoined`、档案和名称查询走 Mojang，玩家登录仍由官方启动器完成）：

```json
[
  { "id": "mojang", "name": "Mojang", "sessionBaseUrl": "https://sessionserver.mojang.com", "profileBaseUrl": "https://sessionserver.mojang.com", "nameLookupBaseUrl": "https://api.mojang.com", "enabled": true, "priority": 10 },
  { "id": "littleskin", "name": "LittleSkin", "baseUrl": "https://littleskin.cn/csl", "enabled": true, "priority": 20 }
]
```

官方 `authserver.mojang.com` 已不再提供可供代理代填的账号密码登录，因此不要把正版密码提交给本站；正版启动器完成登录后，服务端的 `hasJoined` 会自动依次查询已配置的上游。

## 内容审核与站点设置

后台审核设置可分别为项目创建和文件提交选择 `none`、`automatic` 或 `full`。自动审核会向外部 API 发送 `{ type, project, file }`，期望返回 `approve`、`reject` 或 `manual`；超时、规则命中、缺少下载源或 hash 会按失败策略（`manual` 或 `reject`）处理。可配置最大文件大小、禁止扩展名、是否强制 hash 与下载源。

注册策略支持开放注册、邀请码和注册后管理员审核。站点身份（名称、图标）与项目图标圆角为全局外观设置。

## 静态 Catalog 构建

编辑 `catalog/catalog.json` 后运行：

```powershell
pnpm build:static
```

等价于先 `pnpm catalog:build`（生成 `apps/web/public/catalog.json` 与 `/api/v1/*.json`），再以 `VITE_STATIC_MODE=true` 构建前端。GitHub Actions 可用同一命令构建并部署到 Pages、R2 或其他静态 CDN。

纯静态部署把 `apps/web/dist` 作为站点根目录，并配置 SPA fallback（未知路径回退到 `index.html`）。静态模式下项目数据请求自动使用带 `.json` 后缀的静态文件；动态 API 模式则走 Hono 路由。

## 部署

- **Node 自托管**：`pnpm build` 后运行 `@andrea/api` 的 Node 入口。账户持久化在 `AUTH_DB_PATH` 指向的 SQLite，文件存 `STORAGE_DIR`。生产环境请设置独立的 `JWT_SECRET`、HTTPS 与 `CORS_ORIGINS`。
- **Cloudflare Workers**：`apps/api` 的 Worker 入口配合 D1 与 R2。D1/PostgreSQL 需依次应用 `migrations/0001_auth.sql` 至 `migrations/0009_ygg.sql`。
- **本地 workerd**：见 [deploy/workerd/README.md](deploy/workerd/README.md)，先 `pnpm build:workerd` 生成 `deploy/workerd/worker.js` 再 `workerd serve config.capnp config`。

当前示例 Catalog 使用 GitHub Release URL 作为文件源；GitHub Release 自动同步建议通过仓库 Action 生成或更新 `catalog/catalog.json`。平台下载接口保持文件 id 不变，并按区域选择源。

## 开发与测试

```powershell
pnpm typecheck   # contracts 构建 + 各包类型检查
pnpm lint        # 各包 lint（tsc --noEmit）
pnpm build       # 递归构建
```

前端测试：

```powershell
pnpm --filter @andrea/web test:markdown          # Markdown 渲染与安全过滤
# 启动 dev 服务器后，在 apps/web 下：
node tests/markdown.browser.mjs                  # 浏览器实测（可用 WEB_URL / CHROME_PATH）
node tests/dependencies.browser.mjs
node tests/site-settings.browser.mjs
node tests/site-identity.browser.mjs
node tests/fields.browser.mjs
```

API 侧测试位于 `apps/api/tests/`。Markdown 渲染行为与安全边界见 [docs/markdown.md](docs/markdown.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 总体架构与领域模型设计 |
| [docs/dependencies.md](docs/dependencies.md) | 依赖声明、约束与解析 API |
| [docs/markdown.md](docs/markdown.md) | Markdown 渲染与安全策略 |
| [docs/builtin-git-wiki-plan.md](docs/builtin-git-wiki-plan.md) | 内建 Wiki / Git 协作规划（未实现） |
| [deploy/workerd/README.md](deploy/workerd/README.md) | 本地 workerd 自托管 |

## 许可证

[Mozilla Public License 2.0](LICENSE) © AndreaFrederica
