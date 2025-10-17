import config from '../config'
import logger from '../logger'
import type { GitHubIdentity, GitHubTokenResponse } from '../../../shared/src/auth'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

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

export { updateGameIndex } from './decksettings/projects'
