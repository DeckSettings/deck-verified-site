import { apiUrl } from 'src/utils/api'
import type { DeckVerifiedAuthTokens } from '../../../shared/src/auth'
import { loginWithPkce as aliasLoginWithPkce, fetchAuthResult as aliasFetchAuthResult } from '@app/auth'

/**
 * Web utilities for auth persistence and initial login orchestration.
 *
 * This file is used by the Pinia auth store. It intentionally does not
 * import any Capacitor plugins (those live in the src-capacitor copy).
 *
 * Exports expected by the store:
 *  - persistToStorage(store)
 *  - loadFromStorage() -> returns a plain object with stored fields
 *  - fetchAuthResult(state) -> queries backend for tokens
 *  - loginWithApi() -> starts login; handles capacitor flow when running on native, otherwise redirects
 */

/**
 * Shape of the auth state fields persisted/loaded by these helpers.
 */
export type PersistedAuth = Partial<AuthState>

export type Tokens = DeckVerifiedAuthTokens
export type LoginWithPkce = () => Promise<Tokens | null>
export type FetchAuthResult = (state: string) => Promise<Tokens>
export type AuthService = {
  loginWithPkce: LoginWithPkce
  fetchAuthResult: FetchAuthResult
}

/**
 * Full AuthState shape expected by the Pinia store.
 * Exported so the store can import the concrete type.
 */
export interface AuthState {
  // persisted fields
  accessToken: string | null
  refreshToken: string | null
  tokenType: string | null
  scope: string | null
  expiresAt: number | null
  refreshExpiresAt: number | null
  dvToken: string | null
}

/**
 * Persist relevant auth fields to localStorage using a plain AuthState snapshot.
 */
export async function persistToStorage(store: AuthState): Promise<void> {
  // TODO: Use secure storage plugin here for capacitor builds
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
    localStorage.setItem('dv_auth', JSON.stringify(payload))
  } catch (e) {
    // Do not crash app on persistence failures; log for diagnostics.
    console.warn('[auth.utils] persistToStorage failed', e)
  }
}

/**
 * Read persisted auth blob from storage and return as a plain object.
 * The caller (store) will hydrate its state from the returned object.
 *
 * Returns an object with any of the PersistedAuth keys set, or an empty object.
 */
export async function loadFromStorage(): Promise<Partial<AuthState>> {
  // TODO: Use secure storage plugin here for capacitor builds
  try {
    const raw = localStorage.getItem('dv_auth')
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
    // Malformed storage entry — remove it and return empty object
    console.warn('[auth.utils] loadFromStorage parse error', e)
    await clearFromStorage()
    return {}
  }
}

export async function clearFromStorage(): Promise<void> {
  // TODO: Use secure storage plugin here for capacitor builds
  localStorage.removeItem('dv_auth')
}

/**
 * Start login flow using the web redirect fallback.
 * The Capacitor variant provides a native flow via the aliased implementation.
 */
export async function loginWithApi(): Promise<DeckVerifiedAuthTokens | null> {
  window.location.href = apiUrl('/deck-verified/api/auth/start?mode=redirect')
  return null
}

const authService: AuthService = {
  loginWithPkce: aliasLoginWithPkce,
  fetchAuthResult: aliasFetchAuthResult,
}

export { aliasLoginWithPkce as loginWithPkce, aliasFetchAuthResult as fetchAuthResult }
export default authService
