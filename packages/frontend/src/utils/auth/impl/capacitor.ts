/**
 * Capacitor auth implementation (in-app browser + deep link).
 *
 * Selected via Vite alias only for Capacitor builds, so SPA/SSR will never import
 * @capacitor/* plugins. Orchestrates:
 *  - Starting the PKCE flow by calling backend /auth/start
 *  - Opening the in-app browser to the provider (via backend URL)
 *  - Listening for deep-link back into the app (App.addListener('appUrlOpen'))
 *  - Finalizing tokens by exchanging the returned state with the backend
 *  - Robust cleanup of listeners and the in-app browser
 */

import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
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
const API_ORIGIN =
  (typeof process !== 'undefined' && process.env && process.env.BACKEND_API_ORIGIN)
    ? String(process.env.BACKEND_API_ORIGIN)
    : ''

const apiUrl = (p: string) => `${API_ORIGIN}${p}`

export async function persistToStorage(store: AuthState): Promise<void> {
  const payload = {
    accessToken: store.accessToken ?? null,
    refreshToken: store.refreshToken ?? null,
    tokenType: store.tokenType ?? null,
    scope: store.scope ?? null,
    expiresAt: store.expiresAt ?? null,
    refreshExpiresAt: store.refreshExpiresAt ?? null,
    dvToken: store.dvToken ?? null,
  }

  try {
    await SecureStoragePlugin.set({ key: STORAGE_KEY, value: JSON.stringify(payload) })
  } catch (e) {
    console.warn('[auth/capacitor] persistToStorage failed', e)
  }
}

export async function loadFromStorage(): Promise<Partial<AuthState>> {
  try {
    const result = await SecureStoragePlugin.get({ key: STORAGE_KEY })
    const raw = result.value
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
    const message = (e as Error)?.message ?? ''
    const notFound = message.includes('does not exist') || message.includes('NOT FOUND')
    if (!notFound) {
      console.warn('[auth/capacitor] loadFromStorage error', e)
    }
    await clearFromStorage()
    return {}
  }
}

export async function clearFromStorage(): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key: STORAGE_KEY })
  } catch (e) {
    const message = (e as Error)?.message ?? ''
    if (!(message.includes('does not exist') || message.includes('NOT FOUND'))) {
      console.warn('[auth/capacitor] clearFromStorage error', e)
    }
  }
}

/**
 * Starts the PKCE login flow for Capacitor builds.
 */
export async function loginWithPkce(): Promise<Tokens | null> {
  const startRes = await fetchService(apiUrl('/deck-verified/api/auth/start?mode=capacitor'), {
    credentials: 'include',
  })
  if (!startRes.ok) throw new Error(`auth/start failed: ${startRes.status}`)
  const { url: authUrl } = (await startRes.json()) as { url: string }

  let handled = false

  await Browser.open({ url: authUrl, windowName: '_self' })

  return await new Promise<Tokens | null>((resolve) => {
    let appUrlOpen: { remove: () => Promise<void> } | undefined
    let browserFinished: { remove: () => Promise<void> } | undefined

    const attachListeners = async () => {
      appUrlOpen = await App.addListener('appUrlOpen', async (data) => {
        if (handled) return
        handled = true
        try {
          const url = new URL((data as { url: string }).url)
          const state = url.searchParams.get('state')
          if (!state) throw new Error('Missing state in redirect')

          const tokens = await fetchAuthResult(state)
          resolve(tokens)
        } catch (e) {
          console.error('[auth/capacitor] finalize error', e)
          resolve(null)
        } finally {
          await safeClose(Browser)
          await safeRemove(appUrlOpen)
          await safeRemove(browserFinished)
        }
      })

      browserFinished = await Browser.addListener('browserFinished', async () => {
        if (handled) return
        handled = true
        resolve(null)
        await safeRemove(appUrlOpen)
        await safeRemove(browserFinished)
      })
    }

    void attachListeners()

    setTimeout(async () => {
      if (!handled) {
        handled = true
        resolve(null)
        await safeRemove(appUrlOpen)
        await safeRemove(browserFinished)
        await safeClose(Browser)
      }
    }, 180_000)
  })
}

export async function fetchAuthResult(state: string): Promise<Tokens> {
  const r = await fetchService(apiUrl(`/deck-verified/api/auth/result?state=${encodeURIComponent(state)}`), {
    credentials: 'include',
  })
  if (!r.ok) throw new Error(`auth_result_error_${r.status}`)
  return (await r.json()) as Tokens
}

async function safeRemove(l?: { remove: () => Promise<void> }) {
  try {
    await l?.remove()
  } catch {
    // ignore
  }
}

async function safeClose(BrowserMod: typeof Browser) {
  try {
    await BrowserMod.close()
  } catch {
    // ignore
  }
}

const svc = { loginWithPkce, fetchAuthResult }
export default svc
