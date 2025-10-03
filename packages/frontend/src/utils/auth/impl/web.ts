/**
 * Web auth implementation (PKCE start with redirect).
 *
 * This module is selected via a Vite alias for web/SSR builds so that no
 * Capacitor plugins are imported into SPA/SSR bundles.
 */
import { fetchService } from 'src/utils/api'

export type Tokens = {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
  refresh_token_expires_in?: number
  dv_token: string
  dv_token_expires_in: number
}

const API_ORIGIN = process.env.BACKEND_API_ORIGIN || ''

const apiUrl = (p: string) => `${API_ORIGIN}${p}`

/**
 * Starts the PKCE login flow for web builds.
 * - Calls backend to initiate the auth process (server generates state/challenge and returns provider URL)
 * - Redirects the page to the provider (via backend URL)
 * - Returns null (control generally does not return after redirect)
 */
export async function loginWithPkce(): Promise<Tokens | null> {
  console.log('[auth/web] starting auth flow')
  const res = await fetchService(apiUrl('/deck-verified/api/auth/start?mode=web'), {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`auth/start failed: ${res.status}`)
  }

  const { url } = (await res.json()) as { url: string }
  // Redirect to provider via backend
  window.location.assign(url)
  return null
}

/**
 * Optional helper to finalise tokens from a `state` parameter (web callback flow).
 * Useful if your web callback route handles completion in-app after redirect.
 */
export async function fetchAuthResult(state: string): Promise<Tokens> {
  const r = await fetchService(apiUrl(`/deck-verified/api/auth/result?state=${encodeURIComponent(state)}`), {
    credentials: 'include',
  })
  if (!r.ok) {
    throw new Error(`auth_result_error_${r.status}`)
  }
  return (await r.json()) as Tokens
}
