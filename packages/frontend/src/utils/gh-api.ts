import { useAuthStore } from 'stores/auth-store'

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
