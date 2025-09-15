import { boot } from 'quasar/wrappers'
import { Platform } from 'quasar'

// Extend the Platform.is type to include our new flag
declare module 'quasar' {
  interface Platform {
    steamdeck: boolean
  }
}

export default boot(() => {
  // Guard for SSR: only run on client where navigator exists
  if (typeof navigator === 'undefined') {
    return
  }
  const ua = navigator.userAgent || ''
  Platform.steamdeck = ua.includes('Steam Deck')
  // Optionally, if you want Steam Deck to act like mobile:
  if (Platform.steamdeck) {
    Platform.is.mobile = true
    Platform.is.desktop = false
  }
})
