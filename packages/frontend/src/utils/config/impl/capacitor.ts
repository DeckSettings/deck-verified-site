import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import type { ConfigPayload } from 'src/utils/config/types'
import { CONFIG_STORAGE_KEY } from 'src/utils/config/types'

export const loadConfig = async (): Promise<Partial<ConfigPayload> | null> => {
  try {
    const result = await SecureStoragePlugin.get({ key: CONFIG_STORAGE_KEY })
    const raw = result.value
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<ConfigPayload>
  } catch (error) {
    const message = (error as Error)?.message ?? ''
    const notFound = message.includes('does not exist') || message.includes('NOT FOUND')
    if (!notFound) {
      console.warn('[config/capacitor] Failed to load storage', error)
    }
    await clearConfig()
    return null
  }
}

export const saveConfig = async (payload: ConfigPayload): Promise<void> => {
  try {
    await SecureStoragePlugin.set({ key: CONFIG_STORAGE_KEY, value: JSON.stringify(payload) })
  } catch (error) {
    console.warn('[config/capacitor] Failed to save storage', error)
  }
}

export const clearConfig = async (): Promise<void> => {
  try {
    await SecureStoragePlugin.remove({ key: CONFIG_STORAGE_KEY })
  } catch (error) {
    const message = (error as Error)?.message ?? ''
    if (!(message.includes('does not exist') || message.includes('NOT FOUND'))) {
      console.warn('[config/capacitor] Failed to clear storage', error)
    }
  }
}
