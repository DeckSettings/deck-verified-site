import { boot } from 'quasar/wrappers'
import { Platform } from 'quasar'

// Extend the Platform.is type to include our new flag
declare module 'quasar' {
  interface Platform {
    isSteamOs: boolean
  }
}

export default boot(() => {
  // Guard for SSR: only run on client where navigator exists
  if (typeof navigator === 'undefined') {
    return
  }
  const ua = navigator.userAgent || ''
  Platform.isSteamOs = ua.includes('Steam Deck')
  if (Platform.isSteamOs) {
    Platform.is.mobile = true
    Platform.is.desktop = false
  }
})
