import { createHmac } from 'crypto'
import cors from 'cors'
import type { RequestHandler } from 'express'
import type { DeckVerifiedAuthTokens, GitHubIdentity } from '../../shared/src/auth'
import config from './config'
import logger from './logger'
import { ensureRedisConnection, redisClient } from './redis'
import {
  generatePkceState,
  generatePkceCodeVerifier,
  generatePkceCodeChallenge,
} from './helpers'
import {
  buildGitHubAuthorizeUrl,
  exchangeGitHubCodeForTokens,
  fetchGitHubUserIdentity,
  refreshGitHubTokens,
} from './external/github'

const normalizeOrigin = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}

const allowedReturnOrigins = (() => {
  const origins = new Set<string>()
  const configured = config.githubPublicWebOrigins
    .map(origin => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin))
  configured.forEach(origin => origins.add(origin))

  const siteOrigin = normalizeOrigin(config.siteBaseUrl)
  if (siteOrigin) {
    origins.add(siteOrigin)
  }

  return origins
})()

const isAllowedBaseUrl = (raw?: string): string | undefined => {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return undefined
    }

    const origin = url.origin
    if (allowedReturnOrigins.size > 0 && !allowedReturnOrigins.has(origin)) {
      return undefined
    }

    url.hash = ''
    url.search = ''
    return (url.origin + url.pathname).replace(/\/$/, '')
  } catch {
    return undefined
  }
}

const sanitizeLocationB64 = (raw?: string): string | undefined => {
  if (!raw) return undefined
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    if (!decoded.startsWith('/')) return undefined
    if (decoded.includes('://')) return undefined
    return decoded
  } catch {
    return undefined
  }
}

const encodeLocationPath = (path: string): string => Buffer.from(path, 'utf8').toString('base64')

const PKCE_STATE_TTL_SECONDS = 600
const AUTH_RESULT_TTL_SECONDS = 120
const DEFAULT_DV_TOKEN_TTL_SECONDS = 15 * 60 * 60
const DV_TOKEN_EXPIRY_BUFFER_SECONDS = 30 * 60

/**
 * Encodes a string or buffer using base64url without padding.
 */
const base64UrlEncode = (input: string | Buffer): string => {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Represents a signed DV token along with its lifetime in seconds.
 */
interface InternalDvToken {
  token: string
  expiresIn: number
}

/**
 * Creates a signed JWT used for Deck Verified internal API authentication.
 *
 * @param identity Minimal GitHub user info for claims.
 * @param ttlSeconds Token lifetime in seconds (clamped to >= 1 second).
 */
const createInternalDvToken = (identity: GitHubIdentity, ttlSeconds: number): InternalDvToken => {
  if (!config.jwtSecret) {
    throw new Error('jwt_secret_not_configured')
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresIn = Math.max(1, Math.floor(ttlSeconds))
  const claims = {
    sub: String(identity.id),
    login: identity.login,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
    scopes: ['internal'],
  }
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(claims))
  const signature = base64UrlEncode(
    createHmac('sha256', config.jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest(),
  )

  return {
    token: `${encodedHeader}.${encodedPayload}.${signature}`,
    expiresIn,
  }
}

/**
 * Attaches a freshly minted DV token to the GitHub token payload.
 */
const appendInternalDvToken = async (tokens: DeckVerifiedAuthTokens): Promise<DeckVerifiedAuthTokens> => {
  if (!config.githubAppConfigured) {
    return tokens
  }
  if (!tokens.access_token) {
    return tokens
  }

  const accessTokenTtlRaw = tokens.expires_in
  const accessTokenTtl = typeof accessTokenTtlRaw === 'number' && Number.isFinite(accessTokenTtlRaw)
    ? Math.floor(accessTokenTtlRaw)
    : null
  let dvTokenTtl = DEFAULT_DV_TOKEN_TTL_SECONDS
  if (accessTokenTtl && accessTokenTtl > 0) {
    const adjusted = accessTokenTtl - DV_TOKEN_EXPIRY_BUFFER_SECONDS
    dvTokenTtl = Math.max(60, adjusted)
    dvTokenTtl = Math.min(dvTokenTtl, accessTokenTtl)
  }

  const identity = await fetchGitHubUserIdentity(tokens.access_token)
  const { token, expiresIn } = createInternalDvToken(identity, dvTokenTtl)

  return {
    ...tokens,
    dv_token: token,
    dv_token_expires_in: expiresIn,
  }
}

/**
 * Builds a CORS middleware for some auth endpoints.
 *
 * Behavior:
 * - If PUBLIC_WEB_ORIGINS is configured, restrict to those origins.
 * - Otherwise, allow any origin. Always sets credentials: true.
 */
export const buildAuthResultCors = (): RequestHandler => {
  const allowedOrigins = config.githubPublicWebOrigins || []
  if (allowedOrigins.length > 0) {
    return cors({
      origin(origin, callback) {
        // Allow no-origin requests (mobile apps, curl) or configured origins
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
          return
        }
        callback(new Error('Not allowed by CORS'))
      },
      credentials: true,
    })
  }
  return cors({ origin: true, credentials: true })
}

/**
 * Handler: Start the PKCE OAuth flow.
 * - Generates state, code_verifier, and code_challenge.
 * - Stores verifier + redirectUri in Redis with TTL.
 * - Redirects to GitHub authorize URL.
 */
export const githubAuthStartHandler = async (options?: {
  mode?: string;
  toBaseUrl?: string;
  toLocationB64?: string
}): Promise<string> => {
  try {
    await ensureRedisConnection()

    const state = generatePkceState()
    const codeVerifier = generatePkceCodeVerifier()
    const codeChallenge = generatePkceCodeChallenge(codeVerifier)

    const defaultBaseUrl = (config.siteBaseUrl || '').replace(/\/$/, '')
    const overrideBaseUrl = isAllowedBaseUrl(options?.toBaseUrl)
    const effectiveBaseUrl = overrideBaseUrl ?? defaultBaseUrl
    const redirectUri = `${effectiveBaseUrl}/deck-verified/api/auth/callback`

    const locationPath = sanitizeLocationB64(options?.toLocationB64)

    await redisClient.setEx(
      `dv:pkce:${state}`,
      PKCE_STATE_TTL_SECONDS,
      JSON.stringify({
        codeVerifier,
        redirectUri,
        mode: options?.mode,
        baseUrl: effectiveBaseUrl,
        locationPath,
      }),
    )

    return buildGitHubAuthorizeUrl({
      state,
      codeChallenge,
      redirectUri,
    })
  } catch (error) {
    throw error
  }
}

/**
 * Handler: OAuth callback processor.
 * - Validates presence of code/state.
 * - Loads PKCE verifier + redirectUri from Redis using state.
 * - Exchanges code -> tokens with GitHub (server-side secret).
 * - Stores tokens in Redis with short TTL for the SPA to claim once.
 * - Responds with a tiny page that postMessage()s the opener and closes, or falls back to a hash route.
 */
export const githubAuthCallbackHandler = async (code: string, state: string): Promise<{ redirectUrl: string }> => {
  try {
    await ensureRedisConnection()

    const cacheKey = `dv:pkce:${state}`
    const cached = await redisClient.get(cacheKey)
    if (!cached) {
      throw new Error('invalid_or_expired_state')
    }

    const { codeVerifier, redirectUri, mode, baseUrl, locationPath } = JSON.parse(cached) as {
      codeVerifier: string;
      redirectUri: string;
      mode?: string;
      baseUrl?: string;
      locationPath?: string;
    }

    const tokenResponse = await exchangeGitHubCodeForTokens({ code, redirectUri, codeVerifier })

    if (!tokenResponse.access_token) {
      logger.warn('GitHub token exchange failed', tokenResponse)
      throw new Error(`token_exchange_failed:${tokenResponse.error ?? 'unknown_error'}`)
    }

    // Store tokens for SPA to claim exactly once
    const resultKey = `dv:auth:result:${state}`
    await redisClient.setEx(resultKey, AUTH_RESULT_TTL_SECONDS, JSON.stringify(tokenResponse))
    await redisClient.del(cacheKey)

    // Adjust the redirect URL based on the login mode
    let redirectUrl
    if (mode === 'capacitor') {
      redirectUrl = `deckverified://auth/complete?state=${encodeURIComponent(state)}`
    } else {
      const defaultBaseUrl = (config.siteBaseUrl || '').replace(/\/$/, '')
      const effectiveBaseUrl = typeof baseUrl === 'string' && baseUrl ? baseUrl : defaultBaseUrl
      redirectUrl = `${effectiveBaseUrl}/auth/complete?state=${encodeURIComponent(state)}`
      if (locationPath) {
        redirectUrl += `&to_location=${encodeURIComponent(encodeLocationPath(locationPath))}`
      }
    }

    return { redirectUrl }
  } catch (error) {
    logger.error('Error processing GitHub auth callback:', error)
    throw error
  }
}


/**
 * Handler: SPA result fetcher.
 * - Expects a "state" query param.
 * - Returns the token payload once, then deletes it.
 */
export const githubAuthResultHandler = async (state: string): Promise<DeckVerifiedAuthTokens> => {
  try {
    if (!state) {
      throw new Error('missing_state')
    }

    await ensureRedisConnection()

    const resultKey = `dv:auth:result:${state}`
    const payload = await redisClient.get(resultKey)
    if (!payload) {
      throw new Error('not_found_or_already_claimed')
    }
    let parsed: DeckVerifiedAuthTokens
    try {
      parsed = JSON.parse(payload) as DeckVerifiedAuthTokens
    } catch (parseError) {
      logger.error('Failed to parse GitHub auth payload from Redis', parseError)
      throw new Error('invalid_auth_payload')
    }

    let responsePayload: DeckVerifiedAuthTokens = parsed
    if (!parsed.error) {
      responsePayload = await appendInternalDvToken(parsed)
    }

    await redisClient.del(resultKey)
    return responsePayload
  } catch (error) {
    logger.error('Error fetching GitHub auth result:', error)
    throw error
  }
}

/**
 * Handler: Refresh a GitHub access token.
 * - Expects JSON body with "refresh_token".
 * - Proxies the refresh request to GitHub and returns the response.
 */
export const githubAuthRefreshHandler = async (refreshToken: string): Promise<DeckVerifiedAuthTokens> => {
  try {
    const refreshResponse = await refreshGitHubTokens({ refreshToken })
    if (refreshResponse.error) {
      return refreshResponse as DeckVerifiedAuthTokens
    }
    if (!refreshResponse.access_token) {
      return refreshResponse as DeckVerifiedAuthTokens
    }

    return await appendInternalDvToken(refreshResponse as DeckVerifiedAuthTokens)
  } catch (error) {
    logger.error('Error refreshing GitHub token:', error)
    throw error
  }
}
