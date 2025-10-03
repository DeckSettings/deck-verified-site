import { apiUrl } from 'src/utils/api'
import type { DeckVerifiedAuthTokens } from '../../../shared/src/auth'
import type { AuthState, PersistedAuth } from 'src/utils/auth/types'
import {
  loginWithPkce as aliasLoginWithPkce,
  fetchAuthResult as aliasFetchAuthResult,
  persistToStorage as aliasPersistToStorage,
  loadFromStorage as aliasLoadFromStorage,
  clearFromStorage as aliasClearFromStorage,
} from '@app/auth'

export type { AuthState, PersistedAuth }

export type Tokens = DeckVerifiedAuthTokens
export type LoginWithPkce = () => Promise<Tokens | null>
export type FetchAuthResult = (state: string) => Promise<Tokens>
export type AuthService = {
  loginWithPkce: LoginWithPkce
  fetchAuthResult: FetchAuthResult
}

export const persistToStorage = async (store: AuthState): Promise<void> =>
  aliasPersistToStorage(store)

export const loadFromStorage = async (): Promise<Partial<AuthState>> =>
  aliasLoadFromStorage()

export const clearFromStorage = async (): Promise<void> =>
  aliasClearFromStorage()

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
