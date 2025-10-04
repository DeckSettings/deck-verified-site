import { boot } from 'quasar/wrappers'
import { Platform } from 'quasar'

// Extend the Platform.is type to include our new flag
declare module 'quasar' {
  interface Platform {
    isMobileUi: boolean
  }
}

export default boot(() => {
  if (process.env.SERVER) {
    globalThis.isCapacitor = false
    globalThis.isSsr = true
    globalThis.isMobile = process.env.BUILD_TARGET === 'mobile'
    Platform.isMobileUi = process.env.BUILD_TARGET === 'mobile'
    return
  }

  // App is not running on server, we can safely use Platform
  globalThis.isCapacitor = 'capacitor' in Platform.is ? (Platform.is as { capacitor: boolean }).capacitor : false
  globalThis.isSsr = 'ssr' in Platform.is ? (Platform.is as { ssr: boolean }).ssr : false
  globalThis.isMobile = globalThis.isCapacitor || (process.env.BUILD_TARGET === 'mobile')
  Platform.isMobileUi = globalThis.isCapacitor || (process.env.BUILD_TARGET === 'mobile')
})
