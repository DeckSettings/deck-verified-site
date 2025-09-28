import { GitHubUser } from './game'

/**
 * Token payload returned by Deck Verified authentication endpoints.
 * Combines the GitHub OAuth tokens with the short-lived internal DV JWT.
 */
export interface GitHubTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

export interface DeckVerifiedAuthTokens extends GitHubTokenResponse {
  dv_token: string
  dv_token_expires_in: number
}


/**
 * Minimal GitHub user profile required for DV token issuance.
 */
export interface GitHubIdentity {
  id: number
  login: string
}

