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
  refreshGitHubTokens,
} from './github'
import cors from 'cors'
import type { RequestHandler } from 'express'

const PKCE_STATE_TTL_SECONDS = 600
const AUTH_RESULT_TTL_SECONDS = 120

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
export const githubAuthStartHandler = async (mode?: string): Promise<string> => {
  try {
    await ensureRedisConnection()

    const state = generatePkceState()
    const codeVerifier = generatePkceCodeVerifier()
    const codeChallenge = generatePkceCodeChallenge(codeVerifier)

    const baseUrl = (config.githubBaseUrl || '').replace(/\/$/, '')
    const redirectUri = `${baseUrl}/deck-verified/api/auth/callback`

    await redisClient.setEx(
      `dv:pkce:${state}`,
      PKCE_STATE_TTL_SECONDS,
      JSON.stringify({ codeVerifier, redirectUri, mode }),
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
    const baseUrl = (config.githubBaseUrl || '').replace(/\/$/, '')
    const completeUrl = `${baseUrl}/auth/complete?state=${encodeURIComponent(state)}`

    await ensureRedisConnection()

    const cacheKey = `dv:pkce:${state}`
    const cached = await redisClient.get(cacheKey)
    if (!cached) {
      throw new Error('invalid_or_expired_state')
    }

    const { codeVerifier, redirectUri } = JSON.parse(cached) as {
      codeVerifier: string
      redirectUri: string
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

    return { redirectUrl: completeUrl }
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
export const githubAuthResultHandler = async (state: string): Promise<any> => {


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

    await redisClient.del(resultKey)
    return JSON.parse(payload)
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
export const githubAuthRefreshHandler = async (refreshToken: string) => {


  try {
    const refreshResponse = await refreshGitHubTokens({ refreshToken })
    return refreshResponse
  } catch (error) {
    logger.error('Error refreshing GitHub token:', error)
    throw error
  }
}
