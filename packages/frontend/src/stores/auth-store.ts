import { defineStore } from 'pinia'
import { featureFlags } from 'src/composables/useFeatureFlags'
import type { DeckVerifiedAuthTokens } from '../../../shared/src/auth'
import { apiUrl, fetchService } from 'src/utils/api'
import {
  persistToStorage,
  loadFromStorage,
  loginWithPkce,
  fetchAuthResult,
  clearFromStorage,
} from 'src/utils/auth'
import type { AuthState } from 'src/utils/auth'


const decodeLocationParam = (value: string): string | null => {
  try {
    const binary = window.atob(value)
    const percentEncoded = Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
    const decoded = decodeURIComponent(percentEncoded)
    if (!decoded.startsWith('/')) return null
    if (decoded.includes('://')) return null
    return decoded
  } catch {
    return null
  }
}

export interface GithubUserProfile {
  id: number
  login: string
  name?: string | null
  avatar_url: string
}

export interface AuthStoreState extends AuthState {
  user: GithubUserProfile | null
  isAuthenticating: boolean
  refreshTimeoutId: number | null
}

const JITTER_MAX_MS = 5 * 60 * 1000               // Apply a jitter of up to 5 minutes
const RESCHEDULE_IF_VALID_FOR_MS = 60 * 60 * 1000 // Do not refresh a token if it has more than 1 hour before it expires
const REFRESH_LOCK_KEY = 'dv_auth_refresh_lock'
const REFRESH_LOCK_TTL_MS = 7_000                 // localStorage lock TTL fallback

export const useAuthStore = defineStore('auth', {
  state: (): AuthStoreState => ({
    user: null,
    isAuthenticating: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    refreshExpiresAt: null,
    tokenType: null,
    scope: null,
    refreshTimeoutId: null,
    dvToken: null,
  }),
  getters: {
    isLoggedIn: (state) => state.user !== null,
    avatarUrl: (state) => state.user?.avatar_url || '',
  },
  actions: {
    setUser(user: GithubUserProfile) {
      this.user = user
    },
    clearUser() {
      this.user = null
    },

    async persistToStorage() {
      // Delegate to utils/auth with an explicit AuthState snapshot to avoid leaking store internals.
      const snapshot: AuthState = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        tokenType: this.tokenType,
        scope: this.scope,
        expiresAt: this.expiresAt,
        refreshExpiresAt: this.refreshExpiresAt,
        dvToken: this.dvToken,
      }
      return persistToStorage(snapshot)
    },

    async loadFromStorage() {
      const obj = await loadFromStorage()
      this.accessToken = obj.accessToken ?? null
      this.refreshToken = obj.refreshToken ?? null
      this.tokenType = obj.tokenType ?? null
      this.scope = obj.scope ?? null
      this.expiresAt = obj.expiresAt ?? null
      this.refreshExpiresAt = obj.refreshExpiresAt ?? null
      this.dvToken = obj.dvToken ?? null

      // If the token is still valid, schedule refresh and fetch the profile
      if (this.accessToken && (!this.expiresAt || this.expiresAt > Date.now())) {
        this.scheduleTokenRefresh()
        if (!this.user) {
          void this.fetchUserProfile()
        }
      } else {
        this.clearTokens()
      }
    },

    // Cross-tab lock around the refresh operation
    async withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
      // Fallback: naïve localStorage lock with TTL
      const owner = Math.random().toString(36).slice(2)
      const tryAcquire = () => {
        const now = Date.now()
        const cur = localStorage.getItem(REFRESH_LOCK_KEY)
        if (cur) {
          try {
            const { until } = JSON.parse(cur)
            if (typeof until === 'number' && until > now) {
              return false // someone else holds it and it's not expired
            }
          } catch {
            // ignore parse errors
          }
        }
        // Tentatively claim
        localStorage.setItem(
          REFRESH_LOCK_KEY,
          JSON.stringify({ owner, until: now + REFRESH_LOCK_TTL_MS }),
        )
        // Verify ownership
        try {
          const chk = JSON.parse(localStorage.getItem(REFRESH_LOCK_KEY) || '{}')
          return chk.owner === owner
        } catch {
          return false
        }
      }

      // brief spin-wait
      const start = Date.now()
      while (!tryAcquire()) {
        if (Date.now() - start > REFRESH_LOCK_TTL_MS) break
        await new Promise((r) => setTimeout(r, 50))
      }

      try {
        return await fn()
      } finally {
        try {
          const cur = localStorage.getItem(REFRESH_LOCK_KEY)
          if (cur) {
            const obj = JSON.parse(cur)
            if (obj.owner === owner) localStorage.removeItem(REFRESH_LOCK_KEY)
          }
        } catch {
          // ignore
        }
      }
    },

    setTokens(tokens: DeckVerifiedAuthTokens) {
      const now = Date.now()
      this.accessToken = tokens.access_token ?? null
      this.refreshToken = tokens.refresh_token ?? null
      this.tokenType = tokens.token_type ?? null
      this.scope = tokens.scope ?? null
      this.expiresAt = tokens.expires_in ? now + tokens.expires_in * 1000 - 30000 : null
      this.refreshExpiresAt = tokens.refresh_token_expires_in
        ? now + tokens.refresh_token_expires_in * 1000 - 30000
        : null
      if (tokens.dv_token) {
        this.dvToken = tokens.dv_token
      } else {
        this.dvToken = null
      }

      void this.persistToStorage()
      this.scheduleTokenRefresh()
    },

    clearTokens() {
      this.accessToken = null
      this.refreshToken = null
      this.tokenType = null
      this.scope = null
      this.expiresAt = null
      this.refreshExpiresAt = null
      this.dvToken = null
      void clearFromStorage()
      this.cancelTokenRefresh()
    },

    cancelTokenRefresh() {
      if (this.refreshTimeoutId !== null) {
        window.clearTimeout(this.refreshTimeoutId)
        this.refreshTimeoutId = null
      }
    },

    scheduleTokenRefresh() {
      this.cancelTokenRefresh()
      if (!this.expiresAt) return

      const msUntilExpiry = this.expiresAt - Date.now()
      if (msUntilExpiry <= 0) {
        void this.refreshAccessToken()
        return
      }

      // Try to refresh a bit *before* actual expiry, with jitter subtracted
      const jitter = Math.floor(Math.random() * JITTER_MAX_MS)
      const delay = Math.max(msUntilExpiry - jitter, 1000)

      this.refreshTimeoutId = window.setTimeout(async () => {
        // First check if another tab may have refreshed while we waited.
        await this.loadFromStorage()

        // If, after syncing, token still exists and is valid for >1h, just reschedule with new jitter
        if (this.expiresAt && this.expiresAt > Date.now() + RESCHEDULE_IF_VALID_FOR_MS) {
          this.scheduleTokenRefresh() // this recomputes jitter
          return
        }

        // Otherwise proceed to refresh (with cross-tab lock)
        await this.refreshAccessToken()
      }, delay)
    },

    async refreshAccessToken(opts: { force?: boolean } = {}): Promise<boolean> {
      if (!this.refreshToken) {
        this.logout()
        return false
      }

      return this.withRefreshLock(async () => {
        // Re-check once we hold the lock: maybe someone just refreshed
        await this.loadFromStorage()
        if (!opts.force && this.expiresAt && this.expiresAt > Date.now() + 60_000) {
          // Valid for > 60s; skip refresh to avoid needless rotation
          return true
        }

        try {
          const r = await fetchService(apiUrl('/deck-verified/api/auth/refresh'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ refresh_token: this.refreshToken }),
          })
          const data = await r.json() as DeckVerifiedAuthTokens

          if (!r.ok || !data.access_token) {
            console.warn('[useAuthStore] Token refresh failed', data)
            // One more chance: another tab might have rotated tokens milliseconds ago.
            await this.loadFromStorage()
            // TODO: If we have an error from the backend saying the refresh token is invalid, we should logout or at least reload the page.
            if (!this.accessToken) this.logout()
            return false
          }

          this.setTokens(data)
          // Refresh profile data
          void this.fetchUserProfile()
          return true
        } catch (e) {
          console.error('[useAuthStore] Token refresh error', e)
          await this.loadFromStorage()
          if (!this.accessToken) this.logout()
          return false
        }
      })
    },

    /**
     * Ensures a DV token is available for backend API calls, forcing a refresh if missing.
     */
    async ensureInternalToken(): Promise<string | null> {
      await this.loadFromStorage()
      if (!featureFlags.enableLogin) return null
      if (this.dvToken) return this.dvToken
      if (!this.refreshToken) return null

      await this.refreshAccessToken({ force: true })
      await this.loadFromStorage()
      return this.dvToken
    },

    async fetchUserProfile() {
      if (!this.accessToken) return
      try {
        const r = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/vnd.github+json',
          },
        })
        if (!r.ok) {
          console.warn('[useAuthStore] Failed to fetch GitHub user profile')
          return
        }
        const u = await r.json() as GithubUserProfile
        const profile: GithubUserProfile = {
          id: u.id,
          login: u.login,
          name: u.name ?? null,
          avatar_url: u.avatar_url,
        }
        this.setUser(profile)
      } catch (e) {
        console.error('[useAuthStore] Error fetching user profile', e)
      }
    },

    async startLogin() {
      if (!featureFlags.enableLogin) {
        console.warn('[useAuthStore] Login attempted while disabled by configuration')
        return
      }
      if (this.isAuthenticating) {
        console.warn('[useAuthStore] Login process is already in progress')
        return
      }

      this.isAuthenticating = true
      try {
        const tokens = await loginWithPkce()
        if (tokens?.access_token) {
          this.setTokens(tokens)
          await this.fetchUserProfile()
        }
      } catch (error) {
        console.error('[useAuthStore] startLogin error', error)
      } finally {
        this.isAuthenticating = false
      }
    },

    initialize() {
      void this.loadFromStorage()
    },
    async completeAuthFromRedirect(fallbackRedirect: string = '/') {
      // Support same-tab fallback: read ?state= from current URL and finish login.
      if (typeof window === 'undefined') return
      try {
        const url = new URL(window.location.href)
        const state = url.searchParams.get('state')
        if (!state) {
          return
        }
        const tokens = await fetchAuthResult(state)
        if (tokens?.access_token) {
          this.setTokens(tokens)
          await this.fetchUserProfile()
        }
      } catch (e) {
        console.error('[useAuthStore] completeAuthFromRedirect error', e)
      } finally {
        // Clean up the URL and optionally redirect
        try {
          const current = new URL(window.location.href)
          const encodedLocation = current.searchParams.get('to_location')
          current.searchParams.delete('state')
          if (encodedLocation) {
            current.searchParams.delete('to_location')
          }
          const params = current.searchParams.toString()
          const newUrl = current.pathname + (params ? '?' + params : '') + current.hash
          window.history.replaceState({}, document.title, newUrl)

          let destination = fallbackRedirect
          if (encodedLocation) {
            const decodedLocation = decodeLocationParam(encodedLocation)
            if (decodedLocation) {
              destination = decodedLocation
            }
          }

          if (destination) {
            window.location.assign(destination)
          }
        } catch {
          // ignore
        }
      }
    },
    logout() {
      this.clearTokens()
      this.clearUser()
    },
  },
})
