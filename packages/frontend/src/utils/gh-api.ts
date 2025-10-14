import { useAuthStore } from 'stores/auth-store'
import { useGithubActionsMonitor } from 'src/composables/useGithubActionsMonitor'
import type { GitHubIssue } from '../../../shared/src/game'

export const updateIssueState = async (issueNumber: number, state: 'open' | 'closed'): Promise<void> => {
  const authStore = useAuthStore()
  if (!authStore.isLoggedIn) {
    throw new Error('Not logged in')
  }
  const accessToken = authStore.accessToken

  const url = `https://api.github.com/repos/DeckSettings/game-reports-steamos/issues/${issueNumber}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(`Failed to update issue state: ${response.statusText} ${JSON.stringify(errorBody)}`)
  }
}

export const deleteIssue = async (issueNumber: number): Promise<void> => {
  const authStore = useAuthStore()
  if (!authStore.isLoggedIn) {
    throw new Error('Not logged in')
  }
  const accessToken = authStore.accessToken

  const url = `https://api.github.com/repos/DeckSettings/game-reports-steamos/issues/${issueNumber}/comments`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: '@/reportbot delete confirm' }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(`Failed to post delete comment: ${response.statusText} ${JSON.stringify(errorBody)}`)
  }

  try {
    const { monitorIssue } = useGithubActionsMonitor()
    void monitorIssue({
      issueNumber,
      issueUrl: `https://github.com/DeckSettings/game-reports-steamos/issues/${issueNumber}`,
      createdAt: new Date().toISOString(),
      workflowType: 'operations',
      operation: 'delete',
    })
  } catch (err) {
    console.warn('Failed to start GitHub actions delete monitor', err)
  }
}

export const createIssue = async (title: string, body: string): Promise<Partial<GitHubIssue>> => {
  const authStore = useAuthStore()
  if (!authStore.isLoggedIn) {
    throw new Error('Not logged in')
  }
  const accessToken = authStore.accessToken

  const url = `https://api.github.com/repos/DeckSettings/game-reports-steamos/issues`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({} as Record<string, unknown>))
    throw new Error(`Failed to create issue: ${response.statusText} ${JSON.stringify(errorBody)}`)
  }

  const created = await response.json().catch(() => null)
  if (!created || typeof created.number !== 'number') {
    throw new Error('Failed to parse created issue response')
  }
  const issueNumber = created.number
  const issueUrl = created?.html_url ?? `https://github.com/DeckSettings/game-reports-steamos/issues/${issueNumber}`
  const createdAt = created?.created_at ?? new Date().toISOString()

  try {
    const { monitorIssue } = useGithubActionsMonitor()
    void monitorIssue({
      issueNumber: issueNumber,
      issueUrl,
      createdAt,
      workflowType: 'validation',
      operation: null,
    })
  } catch (err) {
    console.warn('Failed to start GitHub actions validation monitor for created issue', err)
  }

  return created as GitHubIssue
}

export const updateIssue = async (issueNumber: number, title: string, body: string): Promise<Partial<GitHubIssue>> => {
  const authStore = useAuthStore()
  if (!authStore.isLoggedIn) {
    throw new Error('Not logged in')
  }
  const accessToken = authStore.accessToken

  const url = `https://api.github.com/repos/DeckSettings/game-reports-steamos/issues/${issueNumber}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({} as Record<string, unknown>))
    throw new Error(`Failed to update issue: ${response.statusText} ${JSON.stringify(errorBody)}`)
  }

  const updated = await response.json().catch(() => null)
  if (!updated || typeof updated.number !== 'number') {
    throw new Error('Failed to parse created issue response')
  }

  // Start a validation monitor for the updated issue (fire-and-forget).
  try {
    const { monitorIssue } = useGithubActionsMonitor()
    void monitorIssue({
      issueNumber: issueNumber,
      issueUrl: updated?.html_url ?? `https://github.com/DeckSettings/game-reports-steamos/issues/${updated.number}`,
      createdAt: updated?.updated_at ?? new Date().toISOString(),
      workflowType: 'validation',
      operation: null,
    })
  } catch (err) {
    console.warn('Failed to start GitHub actions validation monitor for updated issue', err)
  }

  return updated as GitHubIssue
}
