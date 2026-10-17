import { ref } from 'vue'

export type GitHubActionsClientStrategy = 'server-first' | 'github-first'
const readBoolean = (key: string, fallback: boolean) => typeof window !== 'undefined' && window.localStorage.getItem(key) !== null ? window.localStorage.getItem(key) === 'true' : fallback
const storedStrategy = typeof window !== 'undefined' ? window.localStorage.getItem('lunapost-github-actions-strategy') : null
export const githubActionsClientCache = ref(readBoolean('lunapost-github-actions-client-cache', true))
export const githubActionsShareResults = ref(readBoolean('lunapost-github-actions-share-results', true))
export const githubActionsClientStrategy = ref<GitHubActionsClientStrategy>(storedStrategy === 'github-first' ? 'github-first' : 'server-first')
export const setGitHubActionsClientCache = (value: boolean) => { githubActionsClientCache.value = value; window.localStorage.setItem('lunapost-github-actions-client-cache', String(value)) }
export const setGitHubActionsShareResults = (value: boolean) => { githubActionsShareResults.value = value; window.localStorage.setItem('lunapost-github-actions-share-results', String(value)) }
export const setGitHubActionsClientStrategy = (value: GitHubActionsClientStrategy) => { githubActionsClientStrategy.value = value; window.localStorage.setItem('lunapost-github-actions-strategy', value) }
