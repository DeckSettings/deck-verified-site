import type { ConfigPayload } from 'src/utils/config/types'
import { CONFIG_STORAGE_KEY } from 'src/utils/config/types'

const readStorage = (): ConfigPayload | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ConfigPayload>
    return {
      hideDuplicateReports: Boolean(parsed?.hideDuplicateReports),
    }
  } catch (error) {
    console.warn('[config/web] Failed to read storage', error)
    return null
  }
}

export const loadConfig = async (): Promise<ConfigPayload | null> => readStorage()

export const saveConfig = async (payload: ConfigPayload): Promise<void> => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('[config/web] Failed to save storage', error)
  }
}

export const clearConfig = async (): Promise<void> => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(CONFIG_STORAGE_KEY)
  } catch (error) {
    console.warn('[config/web] Failed to clear storage', error)
  }
}
