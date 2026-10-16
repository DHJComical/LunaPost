<template>
  <q-page class="page-shell account-page q-py-xl">
    <AppPageHeader eyebrow="ACCOUNT" title="账户设置" :description="auth.account?.email">
      <template #actions>
        <q-btn outline color="primary" icon="account_circle" label="查看公开主页" :to="auth.account ? `/users/${auth.account.id}` : undefined" />
        <q-btn flat icon="refresh" label="刷新" :loading="loading" @click="load" />
      </template>
    </AppPageHeader>
    <AppNotice v-if="error" tone="error" class="q-mb-md">{{ error }}</AppNotice>
    <q-card flat bordered class="account-card">
      <q-card-section class="account-card__body">
        <FormSection title="公开资料" description="这些信息会显示在你的公开主页和项目作者区域。">
          <FormGrid>
            <q-input v-model="profileForm.username" outlined label="用户名" hint="仅限字母、数字、点、短横线和下划线" />
            <q-input v-model="profileForm.displayName" outlined label="显示名称" />
            <q-input v-model="profileForm.location" outlined label="所在地" />
            <q-input v-model="profileForm.websiteUrl" outlined label="个人网站 URL" type="url" />
            <q-input v-model="profileForm.githubUrl" outlined label="GitHub URL" type="url" />
            <q-input v-model="profileForm.avatarUrl" class="form-grid__full" outlined label="头像 URL" type="url" />
            <q-input v-model="profileForm.bio" class="form-grid__full" outlined type="textarea" autogrow label="个人简介" />
            <FormActions class="form-grid__full">
              <q-btn color="primary" label="保存公开资料" :loading="profileSaving" @click="saveProfile" />
            </FormActions>
          </FormGrid>
        </FormSection>
      </q-card-section>
    </q-card>
    <q-card flat bordered class="account-card">
      <q-card-section class="account-card__body">
        <SectionHeading title="Minecraft 皮肤" description="上传后会作为 Yggdrasil Profile 的纹理地址使用。" />
        <div class="row q-col-gutter-md items-start">
          <div class="col-12 col-md-3"><q-img v-if="auth.account?.metadata.skinUrl" :src="auth.account.metadata.skinUrl" ratio="1" fit="contain" class="skin-preview" /><div v-else class="skin-empty">暂无皮肤</div></div>
          <div class="col-12 col-md-9">
            <FormGrid :columns="1">
              <q-file v-model="skinFile" outlined accept="image/png,image/jpeg" label="上传皮肤图片" hint="PNG/JPEG，最大 2 MB" :disable="skinUploading" @update:model-value="uploadSkin" />
              <q-file v-model="capeFile" outlined accept="image/png,image/jpeg" label="上传披风图片" hint="可选，PNG/JPEG，最大 2 MB" :disable="skinUploading" @update:model-value="uploadCape" />
              <FormActions>
                <q-btn color="primary" label="保存皮肤设置" :loading="skinSaving" @click="saveSkin" />
                <q-btn flat color="negative" label="清除皮肤和披风" :disable="skinSaving" @click="clearSkin" />
              </FormActions>
            </FormGrid>
          </div>
        </div>
      </q-card-section>
    </q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="同步 Mojang 官方资料" description="使用 Microsoft 设备码登录，同步官方 UUID、皮肤和披风。"><template #actions><q-btn color="primary" label="连接 Microsoft" :loading="mojangLoading" @click="connectMojang" /></template></SectionHeading></q-card-section></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="我的收藏夹" description="收藏的项目会同步到你的账户，方便下次继续下载和编辑。"><template #actions><q-btn flat icon="refresh" :loading="loading" @click="loadFavorites" /></template></SectionHeading></q-card-section><q-separator /><q-list separator><q-item v-for="project in favorites" :key="project.slug" clickable :to="`/projects/${project.slug}`"><q-item-section avatar><q-avatar size="42px"><q-img v-if="project.iconUrl || project.iconUrls?.[0]" :src="project.iconUrl || project.iconUrls[0]" fit="cover" /><span v-else>{{ project.title.slice(0, 1) }}</span></q-avatar></q-item-section><q-item-section><q-item-label>{{ project.title }}</q-item-label><q-item-label caption>{{ project.description }}</q-item-label></q-item-section><q-item-section side><q-btn flat dense round icon="favorite" color="pink" aria-label="取消收藏" @click.prevent.stop="removeFavorite(project.slug)" /></q-item-section></q-item><q-item v-if="!favorites.length"><q-item-section class="text-grey-7">还没有收藏项目</q-item-section></q-item></q-list></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="编辑器偏好" description="选择项目内容、版本和文件源码编辑器的交互方式。Monaco 提供语法高亮、格式化和搜索功能。"><template #actions><q-toggle v-model="monacoEnabled" checked-icon="code" unchecked-icon="notes" color="primary" label="使用 Monaco 编辑器" /></template></SectionHeading></q-card-section></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="本地设置" description="只保存在这台设备的浏览器里，不会同步到账户，也不会上传到服务端。" /></q-card-section><q-separator /><q-card-section class="row q-col-gutter-md items-center"><div class="col-12 col-md-6"><q-toggle v-model="freezeResults" color="primary" label="结果不变时不重建列表" /><div class="text-caption text-grey-7">Discover 重新请求后，如果返回结果与当前显示一致，就保留已有卡片，列表不闪、滚动位置不丢。</div></div><div class="col-12 col-md-6"><q-select v-model="freezePolicy" outlined dense emit-value map-options label="“结果不变”的判定方式" :disable="!freezeResults" :options="freezePolicyOptions" /></div></q-card-section><q-separator /><q-card-section class="row q-col-gutter-md items-center"><div class="col-12 col-md-6"><q-select v-model="scrollMode" outlined dense emit-value map-options label="Discover 的滚动方式" :options="scrollModeOptions" /></div><div class="col-12 col-md-6"><div class="text-caption text-grey-7">整页滚动（默认）由浏览器滚整篇文档，读屏和阅读体验更自然；结果区滚动会把筛选栏、类型标签和工具栏固定住，只让项目列表滚动。窄屏下始终使用整页滚动。</div></div></q-card-section></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="我的组织" description="组织是独立的项目所有者，可以拥有多个协作者。"><template #actions><q-btn color="primary" outline icon="corporate_fare" label="建立组织" @click="createOrg" /></template></SectionHeading></q-card-section><q-separator /><q-list separator><q-item v-for="organization in organizations" :key="organization.id" clickable :to="`/organizations/${organization.slug}`"><q-item-section avatar><q-avatar color="primary" text-color="dark">{{ organization.name.slice(0, 1).toUpperCase() }}</q-avatar></q-item-section><q-item-section><q-item-label>{{ organization.name }}</q-item-label><q-item-label caption>@{{ organization.slug }} · {{ organization.description || '暂无简介' }}</q-item-label></q-item-section></q-item><q-item v-if="!organizations.length"><q-item-section class="text-grey-7">还没有组织</q-item-section></q-item></q-list></q-card>
    <q-card flat bordered class="account-card">
      <q-card-section class="account-card__body"><SectionHeading title="API Keys" description="用于启动器或自动化服务调用 API。密钥只会在创建时显示一次。"><template #actions><q-btn color="primary" label="创建 Key" @click="create" /></template></SectionHeading></q-card-section>
      <q-separator />
      <q-list separator>
        <q-item v-for="key in keys" :key="key.id">
          <q-item-section><q-item-label>{{ key.name }}</q-item-label><q-item-label caption>{{ key.scopes.join(', ') }} · {{ formatDate(key.createdAt) }}</q-item-label></q-item-section>
          <q-item-section side><q-btn flat dense color="negative" label="吊销" :disable="Boolean(key.revokedAt)" @click="revoke(key.id)" /></q-item-section>
        </q-item>
        <q-item v-if="!keys.length"><q-item-section class="text-grey-7">暂无 API Key</q-item-section></q-item>
      </q-list>
    </q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="项目邀请" /></q-card-section><q-separator /><q-list separator><q-item v-for="invite in invitations" :key="invite.id"><q-item-section><q-item-label>{{ invite.projectSlug }}</q-item-label><q-item-label caption>角色：{{ invite.role }} · {{ formatDate(invite.createdAt) }}</q-item-label></q-item-section><q-item-section side class="row q-gutter-xs"><q-btn dense flat color="primary" label="接受" @click="respond(invite.id, 'accepted')" /><q-btn dense flat color="negative" label="拒绝" @click="respond(invite.id, 'declined')" /></q-item-section></q-item><q-item v-if="!invitations.length"><q-item-section class="text-grey-7">暂无待处理邀请</q-item-section></q-item></q-list></q-card>
    <q-card flat bordered class="account-card"><q-card-section class="account-card__body"><SectionHeading title="站内消息" /></q-card-section><q-separator /><q-list separator><q-item v-for="message in notifications" :key="message.id" :class="{ 'bg-blue-1': !message.readAt }" clickable @click="read(message.id)"><q-item-section><q-item-label>{{ message.title }}</q-item-label><q-item-label caption>{{ message.body }}</q-item-label></q-item-section><q-item-section side><span class="text-caption">{{ formatDate(message.createdAt) }}</span></q-item-section></q-item><q-item v-if="!notifications.length"><q-item-section class="text-grey-7">暂无消息</q-item-section></q-item></q-list></q-card>
    <q-dialog v-model="tokenDialog" persistent><q-card style="min-width: min(520px, 90vw)"><q-card-section><div class="text-h6">保存 API Key</div><p class="text-body2">这个令牌不会再次显示，请立即复制并保存。</p><q-input :model-value="newToken" readonly outlined autogrow><template #append><q-btn flat round icon="content_copy" @click="copyToken" /></template></q-input></q-card-section><q-card-actions align="right"><q-btn color="primary" label="已保存" v-close-popup /></q-card-actions></q-card></q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppNotice from '../components/AppNotice.vue'
import AppPageHeader from '../components/AppPageHeader.vue'
import FormActions from '../components/FormActions.vue'
import FormGrid from '../components/FormGrid.vue'
import FormSection from '../components/FormSection.vue'
import SectionHeading from '../components/SectionHeading.vue'
import { createApiKey, createOrganization, listApiKeys, listFavorites, listInvitations, listNotifications, listOrganizations, markNotificationRead, pollMojangDeviceCode, respondInvitation, revokeApiKey, setProjectFavorite, startMojangDeviceCode, updateMinecraftProfile, updateProfile, uploadSkinAsset, type ApiKeySummary, type Invitation, type Notification } from '../lib/account'
import type { Project } from '@andrea/contracts'
import { useMonacoEditor, setMonacoEditor } from '../editorPreferences'
import { discoverFreezePolicy, discoverScrollMode, freezeDiscoverList, setDiscoverFreezePolicy, setDiscoverScrollMode, setFreezeDiscoverList, type DiscoverFreezePolicy, type DiscoverScrollMode } from '../discoverPreferences'

const auth = useAuthStore(); const router = useRouter(); const keys = ref<ApiKeySummary[]>([]); const invitations = ref<Invitation[]>([]); const notifications = ref<Notification[]>([]); const organizations = ref<Awaited<ReturnType<typeof listOrganizations>>['organizations']>([]); const favorites = ref<Project[]>([]); const loading = ref(false); const profileSaving = ref(false); const skinUploading = ref(false); const skinSaving = ref(false); const mojangLoading = ref(false); const skinFile = ref<File | null>(null); const capeFile = ref<File | null>(null); const error = ref(''); const tokenDialog = ref(false); const newToken = ref(''); const profileForm = reactive({ username: '', displayName: '', bio: '', avatarUrl: '', websiteUrl: '', githubUrl: '', location: '' }); const monacoEnabled = computed({ get: () => useMonacoEditor.value, set: (value: boolean) => setMonacoEditor(value) })
const freezeResults = computed({ get: () => freezeDiscoverList.value, set: (value: boolean) => setFreezeDiscoverList(value) })
const freezePolicy = computed({ get: () => discoverFreezePolicy.value, set: (value: DiscoverFreezePolicy) => setDiscoverFreezePolicy(value) })
const freezePolicyOptions = [{ label: '逐项比对渲染字段', value: 'deep' }, { label: '只比对 id 顺序与总数', value: 'id' }]
const scrollMode = computed({ get: () => discoverScrollMode.value, set: (value: DiscoverScrollMode) => setDiscoverScrollMode(value) })
const scrollModeOptions = [{ label: '整页滚动', value: 'page' }, { label: '只滚动结果区', value: 'results' }]
const formatDate = (value: string) => new Date(value).toLocaleString()
const load = async () => { loading.value = true; error.value = ''; try { const [keyResult, invitationResult, notificationResult, organizationResult] = await Promise.all([listApiKeys(), listInvitations(), listNotifications(), listOrganizations()]); keys.value = keyResult.apiKeys; invitations.value = invitationResult.invitations; notifications.value = notificationResult.notifications; organizations.value = organizationResult.organizations; Object.assign(profileForm, { username: auth.account?.metadata.username ?? '', displayName: auth.account?.metadata.displayName ?? '', bio: auth.account?.metadata.bio ?? '', avatarUrl: auth.account?.metadata.avatarUrl ?? '', websiteUrl: auth.account?.metadata.websiteUrl ?? '', githubUrl: auth.account?.metadata.githubUrl ?? '', location: auth.account?.metadata.location ?? '' }) } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取账户信息失败' } finally { loading.value = false } }
const loadFavorites = async () => { try { favorites.value = (await listFavorites()).projects } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取收藏夹失败' } }
const removeFavorite = async (slug: string) => { try { await setProjectFavorite(slug, false); favorites.value = favorites.value.filter((project) => project.slug !== slug) } catch (cause) { error.value = cause instanceof Error ? cause.message : '取消收藏失败' } }
const saveProfile = async () => { profileSaving.value = true; try { const result = await updateProfile({ ...profileForm, username: profileForm.username.trim() || undefined, avatarUrl: profileForm.avatarUrl || null, websiteUrl: profileForm.websiteUrl || null, githubUrl: profileForm.githubUrl || null, links: [] }); auth.setAccount(result.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存公开资料失败' } finally { profileSaving.value = false } }
const uploadSkin = async (value: File | File[] | null) => { const file = Array.isArray(value) ? value[0] : value; if (!file) return; skinUploading.value = true; try { const result = await uploadSkinAsset(file); const response = await updateMinecraftProfile({ skinUrl: result.url, capeUrl: auth.account?.metadata.capeUrl ?? null }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : '皮肤上传失败' } finally { skinUploading.value = false } }
const uploadCape = async (value: File | File[] | null) => { const file = Array.isArray(value) ? value[0] : value; if (!file) return; skinUploading.value = true; try { const result = await uploadSkinAsset(file); const response = await updateMinecraftProfile({ skinUrl: auth.account?.metadata.skinUrl ?? null, capeUrl: result.url }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : '披风上传失败' } finally { skinUploading.value = false } }
const saveSkin = async () => { skinSaving.value = true; try { const response = await updateMinecraftProfile({ skinUrl: auth.account?.metadata.skinUrl ?? null, capeUrl: auth.account?.metadata.capeUrl ?? null }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : '皮肤保存失败' } finally { skinSaving.value = false } }
const clearSkin = async () => { skinSaving.value = true; try { const response = await updateMinecraftProfile({ skinUrl: null, capeUrl: null }); auth.setAccount(response.account) } catch (cause) { error.value = cause instanceof Error ? cause.message : '清除皮肤失败' } finally { skinSaving.value = false } }
const connectMojang = async () => { mojangLoading.value = true; try { const device = await startMojangDeviceCode(); window.open(device.verification_uri, '_blank', 'noopener'); window.prompt(`请在浏览器中完成 Microsoft 登录，然后返回此页面。设备码：${device.user_code}`, device.user_code); const deadline = Date.now() + device.expires_in * 1000; let lastError = ''; while (Date.now() < deadline) { try { const result = await pollMojangDeviceCode(device.device_code); if (result.ok) { await auth.load(); break } } catch (cause) { lastError = cause instanceof Error ? cause.message : '' } await new Promise((resolve) => window.setTimeout(resolve, Math.max(5, device.interval ?? 5) * 1000)) } if (lastError && !auth.account?.metadata.minecraftUuid) error.value = `Mojang 同步失败：${lastError}` } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法开始 Mojang 登录' } finally { mojangLoading.value = false } }
const createOrg = async () => { const name = window.prompt('组织名称'); if (!name?.trim()) return; const slug = window.prompt('组织标识（小写字母、数字和短横线）', name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); if (!slug?.trim()) return; try { const result = await createOrganization({ name: name.trim(), slug: slug.trim() }); organizations.value.unshift(result.organization) } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建组织失败' } }
const create = async () => { const name = window.prompt('请输入 API Key 名称', '我的启动器'); if (!name?.trim()) return; try { const result = await createApiKey(name.trim()); keys.value.unshift(result.apiKey); newToken.value = result.token; tokenDialog.value = true } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建 API Key 失败' } }
const revoke = async (id: string) => { if (!window.confirm('确定吊销这个 API Key 吗？')) return; try { await revokeApiKey(id); const key = keys.value.find((item) => item.id === id); if (key) key.revokedAt = new Date().toISOString() } catch (cause) { error.value = cause instanceof Error ? cause.message : '吊销 API Key 失败' } }
const respond = async (id: string, status: 'accepted' | 'declined') => { try { await respondInvitation(id, status); invitations.value = invitations.value.filter((item) => item.id !== id) } catch (cause) { error.value = cause instanceof Error ? cause.message : '处理邀请失败' } }
const read = async (id: string) => { try { await markNotificationRead(id); const item = notifications.value.find((message) => message.id === id); if (item) item.readAt = new Date().toISOString() } catch { /* best effort */ } }
const copyToken = async () => { await navigator.clipboard?.writeText(newToken.value) }
onMounted(async () => { await auth.load(); if (!auth.account) return router.replace('/auth'); await Promise.all([load(), loadFavorites()]) })
</script>

<style scoped>
.account-page > .account-card + .account-card { margin-top: var(--app-space-lg); }
.account-card { border-radius: var(--app-radius-lg); }
.account-card__body { padding: 20px; }
.account-card__body :deep(.section-heading:last-child) { margin-bottom: 0; }
.skin-preview { max-width: 180px; border-radius: 12px; background: var(--q-color-grey-2); }
.skin-empty { min-height: 180px; display: grid; place-items: center; border-radius: 12px; background: var(--q-color-grey-2); color: var(--q-color-grey-7); }
@media (max-width: 600px) { .account-card__body { padding: 16px; } }
</style>
