<template>
  <q-page class="page-shell project-editor-page q-py-xl">
    <AppPageHeader eyebrow="PROJECT EDITOR" :title="isNew ? '新建项目' : '编辑项目'" description="分区编辑项目资料、版本文件和下载分发策略。">
      <template #actions><q-btn flat icon="arrow_back" label="返回后台" to="/admin" /></template>
    </AppPageHeader>
    <AppNotice v-if="error" tone="error" class="q-mb-md">{{ error }}</AppNotice>
    <q-form @submit.prevent="save">
      <q-card flat bordered class="editor-shell">
        <q-tabs v-model="activeTab" inline-label mobile-arrows outside-arrows class="editor-tabs" active-color="primary" indicator-color="primary">
          <q-tab name="basic" icon="info" label="基本信息" /><q-tab name="gallery" icon="photo_library" label="画廊" /><q-tab name="licenses" icon="gavel" label="许可证" /><q-tab name="content" icon="article" label="内容与链接" /><q-tab name="versions" icon="inventory_2" label="版本与文件" /><q-tab name="delivery" icon="public" label="CDN 与镜像" /><q-tab v-if="!isNew" name="members" icon="group" label="参与者" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="activeTab" animated keep-alive class="editor-panels">
          <q-tab-panel name="basic">
            <FormSection title="项目身份" description="设置项目名称、地址和所有者。">
              <FormGrid>
                <q-input v-model="form.title" outlined label="项目名称" required />
                <q-input v-model="form.slug" outlined label="Slug" hint="只能使用小写字母、数字和短横线" required :disable="!isNew" />
                <q-select v-if="isNew && organizations.length" v-model="form.ownerId" outlined label="项目所有者" emit-value map-options :options="ownerOptions" />
                <q-select v-model="form.type" outlined label="项目类型" :options="types" emit-value map-options />
              </FormGrid>
            </FormSection>

            <FormSection title="项目介绍与图标" description="编写项目简介并设置展示图标。">
              <FormGrid>
                <q-input v-model="form.description" class="form-grid__full" outlined type="textarea" autogrow label="项目描述" required />
                <q-input v-model="form.iconUrl" outlined label="主图标 URL" />
                <FileButton label="上传本站图标" accept="image/*" @select="files => uploadAsset(files, 'icon')" />
                <q-input v-model="form.iconUrls" class="form-grid__full" outlined label="更多图标 URL" hint="多个 URL 用逗号分隔" />
              </FormGrid>
            </FormSection>

            <FormSection title="兼容范围与来源" description="声明支持的加载器和游戏版本，并填写许可证与源码仓库。">
              <FormGrid>
                <q-input v-model="form.license" outlined label="兼容许可证标识" placeholder="MIT（兼容旧数据）" />
                <q-input v-model="form.repositoryUrl" outlined label="源码仓库 URL" type="url" />
                <StringOptionSelect v-model="projectLoaders" :options="loaderOptions" multiple label="加载器" hint="可多选；搜索或输入新加载器后按 Enter 添加。" empty-label="输入加载器并按 Enter 添加。" />
                <StringOptionSelect v-model="projectGameVersions" :options="gameVersionOptions" multiple label="游戏版本" hint="可多选；搜索或输入新版本后按 Enter 添加。" empty-label="输入版本并按 Enter 添加。" />
              </FormGrid>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="gallery">
            <FormSection title="项目画廊" description="展示截图、宣传图和功能预览。支持外链，也支持上传到本站。">
              <template #actions>
                <q-btn outline dense icon="add_link" label="添加 URL" @click="galleryUrls.push('')" />
                <FileButton label="上传图片" accept="image/*" multiple @select="uploadGalleryFiles" />
              </template>
              <div class="gallery-editor">
                <div v-if="galleryUrls.length" class="gallery-editor-grid">
                  <div v-for="(url, index) in galleryUrls" :key="`${url}-${index}`" class="gallery-editor-item">
                    <q-img v-if="url" :src="url" ratio="16/9" fit="cover" />
                    <div v-else class="gallery-editor-placeholder"><q-icon name="image" size="32px" /></div>
                    <q-btn round dense color="negative" icon="delete" class="gallery-editor-remove" aria-label="删除图片" @click="galleryUrls.splice(index, 1)" />
                    <q-input v-model="galleryUrls[index]" outlined placeholder="图片 URL" />
                  </div>
                </div>
                <q-input v-else v-model="form.gallery" outlined label="图片 URL（可选）" hint="也可以直接粘贴逗号分隔的图片 URL" />
              </div>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="licenses">
            <FormSection title="许可证文件" description="一个项目可以包含多个许可证，也可以填写自定义许可证原文。">
              <template #actions>
                <q-btn outline dense icon="add" label="添加许可证" @click="licenses.push({ id: `license-${Date.now()}`, name: '新许可证', fileName: 'LICENSE', text: '' })" />
              </template>
              <div class="form-item-list">
                <FormItemCard v-for="(license, index) in licenses" :key="license.id" :title="license.name || `许可证 ${index + 1}`">
                  <template #actions>
                    <q-btn flat dense round color="negative" icon="delete" :aria-label="`删除许可证 ${license.name || index + 1}`" @click="licenses.splice(index, 1)" />
                  </template>
                  <FormGrid>
                    <q-input v-model="license.name" outlined label="名称" />
                    <q-input v-model="license.spdx" outlined label="SPDX 标识" placeholder="MIT / LGPL-3.0" />
                    <q-input v-model="license.fileName" outlined label="文件名" placeholder="LICENSE" />
                    <q-input v-model="license.url" outlined label="许可证 URL" type="url" />
                    <CodeEditor :model-value="license.text ?? ''" class="form-grid__full" language="plaintext" :label="`${license.name || '许可证'} 原文`" height="220px" @update:model-value="value => license.text = value" />
                  </FormGrid>
                </FormItemCard>
              </div>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="content">
            <FormSection title="内容与分类" description="整理项目介绍、搜索标签和运行环境。">
              <FormGrid>
                <q-input v-model="form.categories" outlined label="分类" hint="例如 adventure, optimization, technology" />
                <q-input v-model="form.keywords" outlined label="关键词" hint="用于搜索，多个值用逗号分隔" />
                <q-select v-model="form.clientSide" outlined emit-value map-options label="客户端" :options="environmentTypes" />
                <q-select v-model="form.serverSide" outlined emit-value map-options label="服务端" :options="environmentTypes" />
                <q-select v-model="form.status" outlined emit-value map-options label="审核状态" :options="statusOptions" />
                <q-toggle v-model="form.featured" dense label="精选项目" color="primary" />
                <CodeEditor v-model="form.body" class="form-grid__full" language="markdown" label="项目正文 / README" height="420px" />
              </FormGrid>
            </FormSection>
            <FormSection title="链接与社区" description="添加项目源码、反馈渠道和其他社区链接。">
              <FormGrid>
                <q-input v-model="form.sourceUrl" outlined label="源码 URL" type="url" />
                <q-input v-model="form.issuesUrl" outlined label="问题反馈 URL" type="url" />
                <q-input v-model="form.discordUrl" outlined label="Discord URL" type="url" />
                <q-input v-model="form.wikiUrl" outlined label="外部 Wiki URL" type="url" />
                <q-input v-model="form.donationUrls" class="form-grid__full" outlined label="捐赠链接" hint="格式：平台=https://...，多个值用逗号分隔" />
                <div class="form-grid__full">
                  <FormSection title="自定义链接" description="可以添加文档、发行说明、Modrinth、CurseForge 或社群链接。">
                    <template #actions>
                      <q-btn flat dense color="primary" icon="add_link" label="添加链接" @click="addCustomLink" />
                    </template>
                    <div v-if="!customLinks.length" class="text-caption text-grey-7">暂无自定义链接。</div>
                    <div v-else class="form-item-list">
                      <FormItemCard v-for="(link, linkIndex) in customLinks" :key="link.id || linkIndex" :title="link.label || `链接 ${linkIndex + 1}`" :description="link.url || undefined">
                        <template #actions><q-btn flat dense round icon="delete" color="negative" :aria-label="`删除链接 ${link.label || linkIndex + 1}`" @click="customLinks.splice(linkIndex, 1)" /></template>
                        <FormGrid :columns="2">
                          <q-input v-model="link.label" outlined label="显示名称" />
                          <q-input v-model="link.url" outlined label="URL" type="url" />
                          <q-input v-model="link.icon" outlined label="图标名" hint="Material icon" />
                          <q-input v-model="link.group" outlined label="分组" />
                          <q-toggle v-model="link.embed" class="form-grid__full" dense label="项目内嵌入" color="primary" />
                        </FormGrid>
                      </FormItemCard>
                    </div>
                  </FormSection>
                </div>
              </FormGrid>
            </FormSection>
            <FormSection title="项目主页与 Wiki" description="高级内容区支持自定义 HTML。">
              <CodeEditor v-model="form.homepageHtml" language="html" label="项目主页 HTML" height="320px" />
              <CodeEditor v-model="form.wikiHtml" language="html" label="Wiki HTML（可选）" height="320px" />
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="versions">
            <FormSection title="版本与文件" description="版本和文件支持可视化编辑，也可以切换到 JSON 源码模式。">
              <template #actions>
                <q-btn-toggle v-model="versionMode" dense unelevated toggle-color="primary" :options="[{ label: '可视化', value: 'visual' }, { label: '源码', value: 'source' }]" />
              </template>
            <div v-if="versionMode === 'visual'">
              <div class="form-item-list">
                <q-expansion-item v-for="(version, versionIndex) in visualVersions" :key="version.id" class="editor-expansion-item version-editor-item" expand-separator default-opened>
                <template #header><q-item-section><q-item-label>{{ version.version || '未命名版本' }}</q-item-label><q-item-label caption>{{ version.type }} · {{ version.files.length }} 个文件</q-item-label></q-item-section><q-item-section side><q-btn flat round dense icon="delete" color="negative" @click.stop="visualVersions.splice(versionIndex, 1)" /></q-item-section></template>
                <q-card-section>
                  <FormGrid>
                    <q-input v-model="version.version" outlined label="版本号" />
                    <q-select v-model="version.type" outlined label="发布类型" emit-value map-options :options="versionTypes" />
                    <StringOptionSelect v-model="version.gameVersions" :options="gameVersionOptions" multiple label="游戏版本" hint="可多选，也可以添加新的游戏版本。" empty-label="输入版本并按 Enter 添加。" />
                    <StringOptionSelect v-model="version.loaders" :options="loaderOptions" multiple label="加载器" hint="可多选，也可以添加新的加载器。" empty-label="输入加载器并按 Enter 添加。" />
                    <q-input v-model="version.publishedAt" outlined label="发布时间" hint="ISO 日期，可留空" />
                    <CodeEditor :model-value="version.description ?? ''" class="form-grid__full" language="markdown" label="版本描述" height="240px" @update:model-value="value => version.description = value" />
                    <CodeEditor :model-value="version.changelog ?? ''" class="form-grid__full" language="markdown" label="更新日志" height="300px" @update:model-value="value => version.changelog = value" />
                  </FormGrid>
                  <DependencyEditor v-model="version.dependencies" :version="version" />
                  <SectionHeading title="文件与下载镜像">
                    <template #actions><q-btn flat dense color="primary" icon="add" label="添加文件" @click="addFile(version)" /></template>
                  </SectionHeading>
                  <div class="form-item-list">
                    <FormItemCard v-for="(file, fileIndex) in version.files" :key="file.id" :title="file.name || '未命名文件'">
                    <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="`删除文件 ${file.name || fileIndex + 1}`" @click="version.files.splice(fileIndex, 1)" /></template>
                    <FormGrid>
                      <q-input v-model="file.id" outlined label="文件 ID" />
                      <q-input v-model="file.name" outlined label="文件名" />
                      <q-select v-model="file.fileType" outlined emit-value map-options label="文件类型" :options="fileTypes" />
                      <q-toggle v-model="file.primary" dense label="主文件" color="primary" />
                      <q-input v-model.number="file.size" outlined type="number" label="大小（字节）" />
                      <q-input v-model="file.sha1" outlined label="SHA-1" />
                      <q-input v-model="file.sha512" outlined label="SHA-512" />
                      <q-input v-model="file.description" class="form-grid__full" outlined type="textarea" autogrow label="文件描述" />
                      <CodeEditor :model-value="metadataText(file)" class="form-grid__full" language="json" label="文件 metadata JSON" height="280px" @update:model-value="(value) => updateMetadata(file, value)" />
                    </FormGrid>
                    <SectionHeading title="镜像地址" description="下载时可手动选择。">
                      <template #actions>
                        <FileButton label="上传本站" @select="files => uploadSelected(files, file)" />
                        <q-btn flat dense color="primary" icon="add" label="添加镜像" @click="addSource(file)" />
                      </template>
                    </SectionHeading>
                    <div class="form-item-list">
                      <FormItemCard v-for="(source, sourceIndex) in file.sources" :key="source.id" title="下载镜像" :description="source.id">
                      <template #actions><q-btn flat round dense icon="delete" color="negative" :disable="file.sources.length <= 1" :aria-label="`删除镜像 ${source.id}`" @click="file.sources.splice(sourceIndex, 1)" /></template>
                      <FormGrid :columns="3">
                          <q-input v-model="source.id" outlined label="镜像 ID" />
                          <q-select v-model="source.kind" outlined emit-value map-options label="类型" :options="sourceTypes" />
                          <q-input v-model="source.region" outlined label="区域" hint="GLOBAL/CN/EU" />
                          <q-input v-model.number="source.priority" outlined type="number" label="优先级" />
                          <q-input v-model="source.url" class="form-grid__full" outlined label="下载 URL" type="url" />
                      </FormGrid>
                      </FormItemCard>
                    </div>
                    </FormItemCard>
                  </div>
                </q-card-section>
                </q-expansion-item>
              </div>
              <DependencyPanel v-if="previewProject" :project="previewProject" preview />
              <q-btn outline color="primary" icon="add" label="添加版本" class="q-mt-md" @click="addVersion" />
            </div>
            <div v-else><q-btn flat color="primary" label="填入版本模板" @click="useTemplate" /><CodeEditor v-model="versionsJson" class="q-mt-sm" language="json" label="versions JSON" height="480px" :error="Boolean(jsonError)" :error-message="jsonError" /></div>
            </FormSection>
          </q-tab-panel>

          <q-tab-panel name="delivery">
            <FormSection title="CDN 与镜像规则" description="CDN 规则会为项目的每个文件自动生成一个镜像。模板支持 {fileId}、{filename}、{projectSlug}、{versionId} 和 {version}。">
              <AppNotice tone="info">文件自身的镜像优先保留；CDN 规则会作为额外镜像加入，下载 API 支持通过 <code>?source=镜像ID</code> 手动选择。</AppNotice>
              <div class="form-item-list">
                <FormItemCard v-for="(rule, index) in cdnRules" :key="rule.id" :title="rule.label || `CDN 规则 ${index + 1}`" :description="rule.id">
                  <template #actions><q-btn flat round dense icon="delete" color="negative" :aria-label="`删除 CDN 规则 ${rule.id}`" @click="cdnRules.splice(index, 1)" /></template>
                  <FormGrid>
                    <q-input v-model="rule.id" outlined label="规则 ID" />
                    <q-input v-model="rule.label" outlined label="名称" />
                    <q-input v-model="rule.region" outlined label="区域" />
                    <q-input v-model.number="rule.priority" outlined type="number" label="优先级" />
                    <q-input v-model="rule.template" class="form-grid__full" outlined label="URL 模板" />
                    <q-toggle v-model="rule.enabled" dense label="启用" color="primary" />
                  </FormGrid>
                </FormItemCard>
              </div>
              <q-btn outline color="primary" icon="add" label="添加 CDN 规则" @click="addCdnRule" />
            </FormSection>
          </q-tab-panel>

          <q-tab-panel v-if="!isNew" name="members">
            <FormSection title="项目参与者" description="管理项目成员和权限。邀请会发送到对方的站内通知。">
              <FormItemCard title="邀请成员" description="搜索账户邮箱或 ID。默认展示站点管理员和开发者的前 20 个账户。">
                <q-form @submit.prevent="invite">
                  <FormGrid :columns="3">
                    <q-select v-model="inviteEmail" class="form-grid__wide member-search-select" outlined stack-label use-input fill-input hide-selected emit-value map-options input-debounce="250" label="搜索成员" placeholder="输入邮箱或 ID 搜索" :options="userOptions" option-label="email" option-value="email" :disable="inviting" :loading="usersLoading" autocomplete="off" @focus="loadUserOptions()" @filter="filterUsers">
                      <template #option="scope">
                        <q-item v-bind="scope.itemProps"><q-item-section><q-item-label>{{ scope.opt.email }}</q-item-label><q-item-label caption>@{{ scope.opt.id }} · {{ scope.opt.role }}</q-item-label></q-item-section></q-item>
                      </template>
                      <template #no-option><q-item><q-item-section class="text-grey-7">没有匹配的管理员或开发者账户</q-item-section></q-item></template>
                    </q-select>
                    <q-select v-model="inviteRole" outlined emit-value map-options label="项目权限" :options="memberRoleOptions" :disable="inviting" />
                    <FormActions class="form-grid__full"><q-btn color="primary" unelevated icon="person_add" label="发送邀请" type="submit" :loading="inviting" /></FormActions>
                  </FormGrid>
                  <AppNotice v-if="inviteMessage" tone="success" class="q-mt-md">{{ inviteMessage }}</AppNotice>
                </q-form>
              </FormItemCard>
              <FormItemCard title="当前成员">
                <q-list separator>
                  <q-item v-for="member in members" :key="member.accountId">
                    <q-item-section avatar><q-avatar color="primary" text-color="dark">{{ member.email.slice(0, 1).toUpperCase() }}</q-avatar></q-item-section>
                    <q-item-section><q-item-label>{{ member.email }}</q-item-label><q-item-label caption>{{ roleLabels[member.role] ?? member.role }}</q-item-label></q-item-section>
                    <q-item-section side><q-btn v-if="member.role !== 'owner'" flat dense color="negative" label="移除" @click="removeMember(member.accountId)" /></q-item-section>
                  </q-item>
                  <q-item v-if="!members.length"><q-item-section class="text-grey-7">还没有参与者记录</q-item-section></q-item>
                </q-list>
              </FormItemCard>
            </FormSection>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
      <div class="editor-action-bar">
        <div class="editor-action-bar__inner">
          <FormActions class="editor-action-bar__actions"><q-btn flat label="取消" to="/admin" /><q-btn color="primary" type="submit" :loading="saving" :label="isNew ? '创建项目' : '保存修改'" /></FormActions>
        </div>
      </div>
    </q-form>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CdnRule, FileRecord, LicenseRecord, ProjectLink, Version } from '@andrea/contracts'
import { getProject } from '../lib/api'
import { createProject, updateProject, inviteProjectMember, listProjectMembers, removeProjectMember, type ProjectMember } from '../lib/admin'
import { listOrganizations, searchUsers, type UserSearchResult } from '../lib/account'
import { useAuthStore } from '../stores/auth'
import CodeEditor from '../components/CodeEditor.vue'
import DependencyEditor from '../components/DependencyEditor.vue'
import DependencyPanel from '../components/DependencyPanel.vue'
import FileButton from '../components/FileButton.vue'
import StringOptionSelect from '../components/StringOptionSelect.vue'
import AppNotice from '../components/AppNotice.vue'
import AppPageHeader from '../components/AppPageHeader.vue'
import FormActions from '../components/FormActions.vue'
import FormGrid from '../components/FormGrid.vue'
import FormItemCard from '../components/FormItemCard.vue'
import FormSection from '../components/FormSection.vue'
import SectionHeading from '../components/SectionHeading.vue'
import { projectSchema } from '@andrea/contracts'

const route = useRoute(); const router = useRouter(); const auth = useAuthStore(); const saving = ref(false); const error = ref(''); const jsonError = ref('')
const isNew = computed(() => route.path === '/admin/projects/new' || route.params.slug === 'new'); const activeTab = ref<'basic' | 'gallery' | 'licenses' | 'content' | 'versions' | 'delivery' | 'members'>('basic'); const versionMode = ref<'visual' | 'source'>('visual'); const visualVersions = ref<Version[]>([]); const versionsJson = ref('[]')
const versionTypes = [{ label: '正式版', value: 'release' }, { label: '测试版', value: 'beta' }, { label: 'Alpha', value: 'alpha' }]; const fileTypes = [{ label: 'Mod', value: 'mod' }, { label: '资源包', value: 'required-resource-pack' }, { label: '可选资源包', value: 'optional-resource-pack' }, { label: '源码包', value: 'source-jar' }, { label: '其他', value: 'unknown' }]; const sourceTypes = [{ label: 'GitHub Release', value: 'github_release' }, { label: '自定义 HTTP', value: 'custom_http' }, { label: '本站托管', value: 'managed' }]
const types = [{ label: 'Mod', value: 'mod' }, { label: 'Modpack', value: 'modpack' }, { label: '资源包', value: 'resourcepack' }, { label: 'Shader', value: 'shader' }, { label: '插件', value: 'plugin' }, { label: '独立工具', value: 'tool' }]; const environmentTypes = [{ label: '必需', value: 'required' }, { label: '可选', value: 'optional' }, { label: '不支持', value: 'unsupported' }, { label: '未声明', value: 'unknown' }]; const statusOptions = [{ label: '已发布', value: 'approved' }, { label: '待审核', value: 'pending' }, { label: '草稿', value: 'draft' }, { label: '已归档', value: 'archived' }]
const form = reactive({ id: '', title: '', slug: '', type: 'mod', ownerId: '', description: '', body: '', categories: '', keywords: '', clientSide: 'unknown', serverSide: 'unknown', status: 'approved', featured: false, iconUrl: '', iconUrls: '', repositoryUrl: '', sourceUrl: '', issuesUrl: '', discordUrl: '', donationUrls: '', license: '', wikiUrl: '', wikiHtml: '', gallery: '', homepageHtml: '', loaders: '', gameVersions: '' }); const licenses = ref<LicenseRecord[]>([]); const galleryUrls = ref<string[]>([]); const members = ref<ProjectMember[]>([]); const roleLabels: Record<string, string> = { owner: '所有者', admin: '项目管理员', editor: '编辑者', reviewer: '审核者', member: '成员' }; const inviteEmail = ref(''); const inviteRole = ref<'admin' | 'editor' | 'reviewer' | 'member'>('editor'); const inviteMessage = ref(''); const inviting = ref(false); const usersLoading = ref(false); const memberRoleOptions = [{ label: '管理员', value: 'admin' }, { label: '编辑者', value: 'editor' }, { label: '审核者', value: 'reviewer' }, { label: '成员', value: 'member' }]; const userOptions = ref<UserSearchResult[]>([]); const customLinks = ref<ProjectLink[]>([]); const cdnRules = ref<CdnRule[]>([]); const organizations = ref<Awaited<ReturnType<typeof listOrganizations>>['organizations']>([]); const ownerOptions = computed(() => [{ label: '我的账户', value: '' }, ...organizations.value.map((organization) => ({ label: `组织：${organization.name}`, value: organization.id }))])
const projectGameVersions = computed<string[]>({
  get: () => form.gameVersions.split(',').map((value) => value.trim()).filter(Boolean),
  set: (values) => { form.gameVersions = values.join(', ') },
})
const projectLoaders = computed<string[]>({
  get: () => form.loaders.split(',').map((value) => value.trim()).filter(Boolean),
  set: (values) => { form.loaders = values.join(', ') },
})
const gameVersionOptions = computed(() => [...new Set([...projectGameVersions.value, ...visualVersions.value.flatMap((version) => version.gameVersions)])].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))
const loaderOptions = computed(() => [...new Set([...projectLoaders.value, ...visualVersions.value.flatMap((version) => [...version.loaders, ...(version.loaderBridges ?? []).flatMap((bridge) => [bridge.fromLoader, bridge.toLoader])])])].filter(Boolean).sort((a, b) => a.localeCompare(b)))
const previewProject = computed(() => { const result = projectSchema.safeParse({ ...form, id: form.id || form.slug, loaders: form.loaders.split(',').map(s => s.trim()), gameVersions: form.gameVersions.split(',').map(s => s.trim()), categories: [], keywords: [], iconUrls: [], gallery: [], versions: visualVersions.value, repositoryUrl: undefined, iconUrl: undefined, sourceUrl: undefined, issuesUrl: undefined, discordUrl: undefined, wikiUrl: undefined, donationUrls: [] }); return result.success ? result.data : null })
const csv = (value: unknown) => String(value).split(',').map((item) => item.trim()).filter(Boolean); const metadataDrafts = ref<Record<string, string>>({}); const metadataText = (file: FileRecord) => metadataDrafts.value[file.id] ?? JSON.stringify(file.metadata ?? {}, null, 2); const updateMetadata = (file: FileRecord, value: string) => { metadataDrafts.value[file.id] = value; try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) file.metadata = parsed } catch { /* preserve the draft until it becomes valid JSON */ } }
watch(versionMode, (mode, previous) => { if (mode === 'source' && previous === 'visual') versionsJson.value = JSON.stringify(visualVersions.value, null, 2); if (mode === 'visual' && previous === 'source') { try { const parsed = JSON.parse(versionsJson.value); if (Array.isArray(parsed)) { visualVersions.value = parsed; jsonError.value = '' } } catch { jsonError.value = '源码 JSON 无法解析' } } })
const useTemplate = () => { versionsJson.value = JSON.stringify([{ id: `${form.slug || 'project'}-1.0.0`, version: '1.0.0', type: 'release', gameVersions: csv(form.gameVersions), loaders: csv(form.loaders), featured: true, status: 'listed', dependencies: [], changelog: '', publishedAt: new Date().toISOString(), files: [] }], null, 2) }
const addVersion = () => { visualVersions.value.push({ id: `${form.slug || 'project'}-${Date.now()}`, version: '1.0.0', type: 'release', gameVersions: csv(form.gameVersions), loaders: csv(form.loaders), featured: true, status: 'listed', dependencies: [], changelog: '', publishedAt: new Date().toISOString(), files: [] }) }
const addFile = (version: Version) => { version.files.push({ id: `${version.id}-file-${Date.now()}`, name: 'project.jar', primary: version.files.length === 0, fileType: 'unknown', metadata: {}, reviewStatus: 'approved', sources: [{ id: `source-${Date.now()}`, kind: 'custom_http', region: 'GLOBAL', url: 'https://example.invalid/download', priority: 10 }] }) }
const addSource = (file: FileRecord) => { file.sources.push({ id: `source-${Date.now()}`, kind: 'custom_http', region: 'GLOBAL', url: 'https://example.invalid/download', priority: 0 }) }; const addCdnRule = () => { cdnRules.value.push({ id: `cdn-${Date.now()}`, label: '新 CDN', template: 'https://cdn.example.com/{projectSlug}/{version}/{filename}', region: 'GLOBAL', priority: 0, enabled: true }) }; const addCustomLink = () => { customLinks.value.push({ id: `link-${Date.now()}`, label: '', url: '', icon: 'link', group: '' }) }
const uploadSelected = async (value: File | File[] | null, file: FileRecord) => { const selected = Array.isArray(value) ? value[0] : value; if (!selected) return; const body = new FormData(); body.append('file', selected); try { const response = await fetch(`/api/v1/projects/${encodeURIComponent(String(route.params.slug))}/files`, { method: 'POST', body, credentials: 'include' }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? '上传失败'); file.name = result.name; file.size = result.size; file.sources = [result.source, ...file.sources.filter((source) => source.id !== result.source.id)] } catch (cause) { error.value = cause instanceof Error ? cause.message : '上传文件失败' } }
const uploadAsset = async (value: File | File[] | null, target: 'icon' | 'gallery') => { const selected = Array.isArray(value) ? value[0] : value; if (!selected) return; const body = new FormData(); body.append('file', selected); try { const response = await fetch('/api/v1/account/uploads', { method: 'POST', body, credentials: 'include' }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? '上传失败'); if (target === 'icon') form.iconUrl = result.url; else form.gallery = `${form.gallery}${form.gallery ? ', ' : ''}${result.url}` } catch (cause) { error.value = cause instanceof Error ? cause.message : '上传图片失败' } }
const uploadGalleryFiles = async (value: File | File[] | null) => { const files = Array.isArray(value) ? value : value ? [value] : []; for (const selected of files) { const body = new FormData(); body.append('file', selected); try { const response = await fetch('/api/v1/account/uploads', { method: 'POST', body, credentials: 'include' }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? '上传失败'); galleryUrls.value.push(result.url) } catch (cause) { error.value = cause instanceof Error ? cause.message : '上传图片失败' } } }
const load = async () => { await auth.load(); if (!auth.account) return router.replace('/auth'); if (!auth.canPublish) return router.replace('/'); organizations.value = (await listOrganizations()).organizations; if (isNew.value) { form.ownerId = ''; return } try { const project = await getProject(String(route.params.slug)); Object.assign(form, { id: project.id, title: project.title, slug: project.slug, type: project.type, ownerId: project.ownerType === 'organization' ? (project.ownerId ?? '') : '', description: project.description, body: project.body ?? '', categories: (project.categories ?? []).join(', '), keywords: (project.keywords ?? []).join(', '), clientSide: project.clientSide ?? 'unknown', serverSide: project.serverSide ?? 'unknown', status: project.status ?? 'approved', featured: project.featured ?? false, iconUrl: project.iconUrl ?? '', iconUrls: (project.iconUrls ?? []).join(', '), repositoryUrl: project.repositoryUrl ?? '', sourceUrl: project.sourceUrl ?? '', issuesUrl: project.issuesUrl ?? '', discordUrl: project.discordUrl ?? '', donationUrls: (project.donationUrls ?? []).map((item) => `${item.platform}=${item.url}`).join(', '), license: project.license ?? '', wikiUrl: project.wikiUrl ?? '', wikiHtml: project.wikiHtml ?? '', gallery: '', homepageHtml: project.homepageHtml ?? '', loaders: project.loaders.join(', '), gameVersions: project.gameVersions.join(', ') }); galleryUrls.value = [...(project.gallery ?? [])]; licenses.value = structuredClone(project.licenses ?? (project.license ? [{ id: 'legacy-license', name: project.license, spdx: project.license, fileName: 'LICENSE', text: '' }] : [])); customLinks.value = structuredClone(project.links ?? []); cdnRules.value = structuredClone(project.cdnRules ?? []); visualVersions.value = structuredClone(project.versions).map((version) => ({ ...version, files: version.files.map((file) => ({ ...file, fileType: file.fileType ?? 'unknown', metadata: file.metadata ?? {}, sources: file.sources.length ? file.sources : [{ id: `source-${file.id}`, kind: 'custom_http' as const, region: 'GLOBAL', url: 'https://example.invalid/download', priority: 0 }] })) })); versionsJson.value = JSON.stringify(project.versions, null, 2); members.value = (await listProjectMembers(String(route.params.slug))).members } catch { error.value = '无法读取项目。' } }
const save = async () => { error.value = ''; jsonError.value = ''; if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) { error.value = 'Slug 格式不正确。'; activeTab.value = 'basic'; return } let versions: unknown = versionMode.value === 'visual' ? visualVersions.value : undefined; if (versionMode.value === 'source') { try { versions = JSON.parse(versionsJson.value); if (!Array.isArray(versions)) throw new Error() } catch { jsonError.value = '必须是合法的 JSON 数组。'; activeTab.value = 'versions'; return } } const donationUrls = csv(form.donationUrls).map((item) => { const [platform, ...urlParts] = item.split('='); return { platform: platform.trim(), url: urlParts.join('=').trim() } }).filter((item) => item.platform && item.url); const links = customLinks.value.map((link) => ({ ...link, label: link.label.trim(), url: link.url.trim(), icon: link.icon?.trim() || 'link', group: link.group?.trim() || undefined })).filter((link) => link.label && link.url); const project = { id: form.id || form.slug, slug: form.slug, ownerType: form.ownerId ? 'organization' : 'account', ...(form.ownerId ? { ownerId: form.ownerId } : {}), title: form.title.trim(), type: form.type, description: form.description.trim(), body: form.body.trim(), categories: csv(form.categories), keywords: csv(form.keywords), clientSide: form.clientSide, serverSide: form.serverSide, status: form.status, featured: form.featured, ...(form.iconUrl.trim() ? { iconUrl: form.iconUrl.trim() } : {}), iconUrls: csv(form.iconUrls), ...(form.repositoryUrl.trim() ? { repositoryUrl: form.repositoryUrl.trim() } : {}), ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}), ...(form.issuesUrl.trim() ? { issuesUrl: form.issuesUrl.trim() } : {}), ...(form.discordUrl.trim() ? { discordUrl: form.discordUrl.trim() } : {}), donationUrls, links, cdnRules: cdnRules.value, ...(form.license.trim() ? { license: form.license.trim() } : {}), licenses: licenses.value.filter((license) => license.name.trim() || license.url || license.text).map((license) => ({ ...license, name: license.name.trim() || '许可证', spdx: license.spdx?.trim() || undefined, url: license.url?.trim() || undefined, fileName: license.fileName?.trim() || undefined, text: license.text || undefined })), ...(form.wikiUrl.trim() ? { wikiUrl: form.wikiUrl.trim() } : {}), ...(form.wikiHtml.trim() ? { wikiHtml: form.wikiHtml } : {}), gallery: galleryUrls.value.length ? galleryUrls.value.filter(Boolean) : csv(form.gallery), ...(form.homepageHtml.trim() ? { homepageHtml: form.homepageHtml } : {}), loaders: csv(form.loaders), gameVersions: csv(form.gameVersions), versions }; saving.value = true; try { const result = isNew.value ? await createProject(project) : await updateProject(String(route.params.slug), project); await router.push(`/projects/${result.project.slug}`) } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存项目失败。' } finally { saving.value = false } }
const loadUserOptions = async (query = '') => { usersLoading.value = true; try { userOptions.value = (await searchUsers(query, String(route.params.slug))).users } catch { userOptions.value = [] } finally { usersLoading.value = false } }; const filterUsers = async (value: string, update: (callback: () => void) => void) => { usersLoading.value = true; try { const result = await searchUsers(value.trim(), String(route.params.slug)); update(() => { userOptions.value = result.users }) } catch { update(() => { userOptions.value = [] }) } finally { usersLoading.value = false } }
const invite = async () => { const email = inviteEmail.value.trim().toLowerCase(); inviteMessage.value = ''; if (!email) return; inviting.value = true; try { await inviteProjectMember(String(route.params.slug), email, inviteRole.value); inviteMessage.value = `已向 ${email} 发送邀请。`; inviteEmail.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : '邀请失败。' } finally { inviting.value = false } }; const removeMember = async (accountId: string) => { if (!window.confirm('确定移除这个成员吗？')) return; try { await removeProjectMember(String(route.params.slug), accountId); members.value = members.value.filter((member) => member.accountId !== accountId) } catch (cause) { error.value = cause instanceof Error ? cause.message : '移除成员失败。' } }
onMounted(load)
</script>
