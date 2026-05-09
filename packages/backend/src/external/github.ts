import config from '../config'
import logger from '../logger'
import type { GitHubIdentity, GitHubTokenResponse } from '../../../shared/src/auth'
import type { GameReportUserReaction } from '../../../shared/src/game'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DECKSETTINGS_REPO_API = 'https://api.github.com/repos/DeckSettings/game-reports-steamos'


interface GitHubIssueReactionRecord {
  id: number
  content: string
  user?: {
    login?: string
  } | null
}

interface GitHubIssueReactionSyncResult {
  currentUserReaction: GameReportUserReaction
  reactions: {
    reactions_thumbs_up: number
    reactions_thumbs_down: number
  }
}

/**
 * Builds the GitHub OAuth authorize URL with PKCE support using repository configuration.
 */
export const buildGitHubAuthorizeUrl = ({ state, codeChallenge, redirectUri }: {
  state: string
  codeChallenge: string
  redirectUri: string
}): string => {
  const clientId = config.githubAppClientId
  if (!clientId) {
    throw new Error('GitHub App client ID is not configured.')
  }

  const url = new URL(GITHUB_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return url.toString()
}

const buildGitHubApiHeaders = (accessToken: string): HeadersInit => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'DeckVerified API',
})

/**
 * Exchanges the GitHub OAuth code for access and refresh tokens using PKCE verifier.
 */
export const exchangeGitHubCodeForTokens = async ({ code, redirectUri, codeVerifier }: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<GitHubTokenResponse> => {
  const clientId = config.githubAppClientId
  const clientSecret = config.githubAppClientSecret
  if (!clientId || !clientSecret) {
    throw new Error('GitHub App credentials are not configured.')
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      logger.error(`GitHub token exchange failed with ${response.status}: ${text}`)
      return { error: 'token_exchange_failed', error_description: text }
    }

    return await response.json() as GitHubTokenResponse
  } catch (error) {
    logger.error('GitHub token exchange network error:', error)
    return { error: 'token_exchange_failed', error_description: 'network_error' }
  }
}

/**
 * Refreshes a GitHub OAuth access token using the provided refresh token.
 */
export const refreshGitHubTokens = async ({ refreshToken }: {
  refreshToken: string
}): Promise<GitHubTokenResponse> => {
  const clientId = config.githubAppClientId
  const clientSecret = config.githubAppClientSecret
  if (!clientId || !clientSecret) {
    throw new Error('GitHub App credentials are not configured.')
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      logger.error(`GitHub token refresh failed with ${response.status}: ${text}`)
      return { error: 'token_refresh_failed', error_description: text }
    }

    return await response.json() as GitHubTokenResponse
  } catch (error) {
    logger.error('GitHub token refresh network error:', error)
    return { error: 'token_refresh_failed', error_description: 'network_error' }
  }
}

/**
 * Fetches the minimal GitHub identity information required to mint DV tokens.
 */
export const fetchGitHubUserIdentity = async (accessToken: string): Promise<GitHubIdentity> => {
  if (!accessToken) {
    throw new Error('missing_access_token_for_identity_lookup')
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DeckVerified API',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      logger.warn(`GitHub identity lookup failed with ${response.status}: ${text}`)
      throw new Error('github_identity_lookup_failed')
    }

    const body = await response.json() as Partial<GitHubIdentity>
    if (typeof body?.id !== 'number' || typeof body?.login !== 'string') {
      throw new Error('github_identity_lookup_invalid_response')
    }

    return { id: body.id, login: body.login }
  } catch (error) {
    logger.error('GitHub identity lookup error:', error)
    throw error
  }
}

const fetchDeckSettingsIssue = async (accessToken: string, issueNumber: number) => {
  const response = await fetch(`${DECKSETTINGS_REPO_API}/issues/${issueNumber}`, {
    headers: buildGitHubApiHeaders(accessToken),
  })

  if (!response.ok) {
    const text = await response.text()
    logger.warn(`Failed to fetch issue ${issueNumber}: ${response.status} ${text}`)
    throw new Error('github_issue_lookup_failed')
  }

  const issue = await response.json() as {
    reactions?: {
      '+1'?: number
      '-1'?: number
    }
  }

  return {
    reactions_thumbs_up: issue.reactions?.['+1'] || 0,
    reactions_thumbs_down: issue.reactions?.['-1'] || 0,
  }
}

const listIssueReactions = async (accessToken: string, issueNumber: number): Promise<GitHubIssueReactionRecord[]> => {
  const response = await fetch(`${DECKSETTINGS_REPO_API}/issues/${issueNumber}/reactions?per_page=100`, {
    headers: buildGitHubApiHeaders(accessToken),
  })

  if (!response.ok) {
    const text = await response.text()
    logger.warn(`Failed to list issue reactions for ${issueNumber}: ${response.status} ${text}`)
    throw new Error('github_issue_reactions_lookup_failed')
  }

  return await response.json() as GitHubIssueReactionRecord[]
}

const deleteReaction = async (accessToken: string, issueNumber: number, reactionId: number): Promise<void> => {
  const response = await fetch(`${DECKSETTINGS_REPO_API}/issues/${issueNumber}/reactions/${reactionId}`, {
    method: 'DELETE',
    headers: buildGitHubApiHeaders(accessToken),
  })

  if (!response.ok && response.status !== 204) {
    const text = await response.text()
    logger.warn(`Failed to delete reaction ${reactionId} on issue ${issueNumber}: ${response.status} ${text}`)
    throw new Error('github_reaction_delete_failed')
  }
}

const createReaction = async (accessToken: string, issueNumber: number, content: '+1' | '-1'): Promise<void> => {
  const response = await fetch(`${DECKSETTINGS_REPO_API}/issues/${issueNumber}/reactions`, {
    method: 'POST',
    headers: {
      ...buildGitHubApiHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  if (!response.ok) {
    const text = await response.text()
    logger.warn(`Failed to create reaction ${content} for issue ${issueNumber}: ${response.status} ${text}`)
    throw new Error('github_reaction_create_failed')
  }
}

export const syncGitHubIssueReaction = async ({
                                                accessToken,
                                                issueNumber,
                                                viewerLogin,
                                                desiredReaction,
                                              }: {
  accessToken: string
  issueNumber: number
  viewerLogin: string
  desiredReaction: 'up'
}): Promise<GitHubIssueReactionSyncResult> => {
  const desiredContent = '+1'
  const reactions = await listIssueReactions(accessToken, issueNumber)
  const viewerReactions = reactions.filter((reaction) =>
    reaction.user?.login === viewerLogin && (reaction.content === '+1' || reaction.content === '-1'),
  )

  const alreadyApplied = viewerReactions.some((reaction) => reaction.content === desiredContent)

  for (const reaction of viewerReactions) {
    await deleteReaction(accessToken, issueNumber, reaction.id)
  }

  let currentUserReaction: GameReportUserReaction = null
  if (!alreadyApplied) {
    await createReaction(accessToken, issueNumber, desiredContent)
    currentUserReaction = desiredReaction
  }

  const updatedCounts = await fetchDeckSettingsIssue(accessToken, issueNumber)

  return {
    currentUserReaction,
    reactions: updatedCounts,
  }
}
