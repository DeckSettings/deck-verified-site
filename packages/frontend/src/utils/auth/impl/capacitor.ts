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

const API_ORIGIN =
  (typeof process !== 'undefined' && process.env && process.env.BACKEND_API_ORIGIN)
    ? String(process.env.BACKEND_API_ORIGIN)
    : ''

const apiUrl = (p: string) => `${API_ORIGIN}${p}`

/**
 * Starts the PKCE login flow for Capacitor builds.
 * - Calls backend to initiate the auth process (server generates state/challenge and returns provider URL)
 * - Opens the in-app browser to the provider (via backend URL)
 * - Waits for the app to be reopened via deep-link (custom scheme or universal link)
 * - Finalises tokens by exchanging the `state` with backend
 *
 * Returns:
 *  - Tokens when finalised successfully
 *  - null if the user closes the in-app browser or times out
 */
export async function loginWithPkce(): Promise<Tokens | null> {
  // 1) Ask backend to start the PKCE flow (capacitor mode)
  console.log('[auth/capacitor] starting auth flow')
  const startRes = await fetchService(apiUrl('/deck-verified/api/auth/start?mode=capacitor'), {
    credentials: 'include',
  })
  if (!startRes.ok) throw new Error(`auth/start failed: ${startRes.status}`)
  const { url: authUrl } = (await startRes.json()) as { url: string }

  let handled = false

  // 2) Open in-app browser
  await Browser.open({ url: authUrl, windowName: '_self' })

  // 3) Wait for either appUrlOpen (deep-link back) or browserFinished (user closed)
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

    // Optional safety timeout (e.g., 3 minutes) so we don't wait forever
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

/**
 * Finalize tokens by exchanging the state with backend.
 * (Keeps the same API as the web implementation for consistency.)
 */
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
