/**
 * Web auth implementation (PKCE start with redirect).
 *
 * This module is selected via a Vite alias for web/SSR builds so that no
 * Capacitor plugins are imported into SPA/SSR bundles.
 */
import { fetchService, apiUrl } from 'src/utils/api'
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
const endpoint = (path: string) => apiUrl(path)

const encodeLocation = (value: string): string => {
  const percentEncoded = encodeURIComponent(value)
  const binary = percentEncoded.replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
  return window.btoa(binary)
}

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
  const baseUrl = window.location.origin
  const locationDescriptor = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const params = new URLSearchParams({ mode: 'web', to_base_url: baseUrl })
  if (locationDescriptor) {
    params.set('to_location', encodeLocation(locationDescriptor))
  }
  const startPath = `/deck-verified/api/auth/start?${params.toString()}`
  const startUrl = endpoint(startPath)

  try {
    const res = await fetchService(startUrl, { credentials: 'include' })
    if (!res.ok) {
      throw new Error(`auth/start failed: ${res.status}`)
    }

    const data = await res.json().catch(() => null) as { url?: string } | null
    if (data?.url) {
      window.location.assign(String(data.url))
      return null
    }
  } catch (err) {
    console.warn('[auth/web] start fetch fallback', err)
  }

  window.location.assign(startUrl)
  return null
}

export async function fetchAuthResult(state: string): Promise<Tokens> {
  const r = await fetchService(endpoint(`/deck-verified/api/auth/result?state=${encodeURIComponent(state)}`), {
    credentials: 'include',
  })
  if (!r.ok) {
    throw new Error(`auth_result_error_${r.status}`)
  }
  return (await r.json()) as Tokens
}
