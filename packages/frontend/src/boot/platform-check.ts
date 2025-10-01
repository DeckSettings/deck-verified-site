import { boot } from 'quasar/wrappers'
import { Platform } from 'quasar'

export default boot(() => {
  globalThis.isCapacitor = 'capacitor' in Platform.is ? (Platform.is as { capacitor: boolean }).capacitor : false
  globalThis.isSsr = 'ssr' in Platform.is ? (Platform.is as { ssr: boolean }).ssr : false
  globalThis.isMobile = globalThis.isCapacitor || (process.env.BUILD_TARGET === 'mobile')
})
