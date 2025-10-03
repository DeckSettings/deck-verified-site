/**
 * Web auth implementation (PKCE start with redirect).
 *
 * This module is selected via a Vite alias for web/SSR builds so that no
 * Capacitor plugins are imported into SPA/SSR bundles.
 */
import { fetchService } from 'src/utils/api'
import type { AuthState } from 'src/utils/auth/types'

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

const STORAGE_KEY = 'dv_auth'
const API_ORIGIN = process.env.BACKEND_API_ORIGIN || ''

const apiUrl = (p: string) => `${API_ORIGIN}${p}`

export async function persistToStorage(store: AuthState): Promise<void> {
  try {
    const payload = {
      accessToken: store.accessToken ?? null,
      refreshToken: store.refreshToken ?? null,
      tokenType: store.tokenType ?? null,
      scope: store.scope ?? null,
      expiresAt: store.expiresAt ?? null,
      refreshExpiresAt: store.refreshExpiresAt ?? null,
      dvToken: store.dvToken ?? null,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('[auth/web] persistToStorage failed', e)
  }
}

export async function loadFromStorage(): Promise<Partial<AuthState>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const obj = JSON.parse(raw)
    return {
      accessToken: obj.accessToken ?? null,
      refreshToken: obj.refreshToken ?? null,
      tokenType: obj.tokenType ?? null,
      scope: obj.scope ?? null,
      expiresAt: obj.expiresAt ?? null,
      refreshExpiresAt: obj.refreshExpiresAt ?? null,
      dvToken: obj.dvToken ?? null,
    }
  } catch (e) {
    console.warn('[auth/web] loadFromStorage parse error', e)
    await clearFromStorage()
    return {}
  }
}

export async function clearFromStorage(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY)
}

export async function loginWithPkce(): Promise<Tokens | null> {
  const res = await fetchService(apiUrl('/deck-verified/api/auth/start?mode=web'), {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`auth/start failed: ${res.status}`)
  }

  const { url } = (await res.json()) as { url: string }
  window.location.assign(url)
  return null
}

export async function fetchAuthResult(state: string): Promise<Tokens> {
  const r = await fetchService(apiUrl(`/deck-verified/api/auth/result?state=${encodeURIComponent(state)}`), {
    credentials: 'include',
  })
  if (!r.ok) {
    throw new Error(`auth_result_error_${r.status}`)
  }
  return (await r.json()) as Tokens
}
