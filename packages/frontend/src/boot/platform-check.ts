import { boot } from 'quasar/wrappers'
import { Platform } from 'quasar'

export default boot(() => {
  globalThis.isCapacitor = Platform.is.capacitor
  globalThis.isSsr = 'ssr' in Platform.is ? (Platform.is as { ssr: boolean }).ssr : false
})
