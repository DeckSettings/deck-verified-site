import type { ConfigPayload } from 'src/utils/config/types'
import {
  loadConfig as implLoad,
  saveConfig as implSave,
  clearConfig as implClear,
} from '@app/config'

export type { ConfigPayload }

export const DEFAULT_CONFIG: ConfigPayload = {
  hideDuplicateReports: false,
}

export const normalizeConfigPayload = (payload: Partial<ConfigPayload> | null | undefined): ConfigPayload => {
  const normalized: ConfigPayload = { ...DEFAULT_CONFIG }

  if (!payload || typeof payload !== 'object') {
    return normalized
  }

  const record = payload as Partial<ConfigPayload>

  (Object.keys(DEFAULT_CONFIG) as Array<keyof ConfigPayload>).forEach((key) => {
    const defaultValue = DEFAULT_CONFIG[key]
    const incomingValue = record[key]

    if (typeof incomingValue === typeof defaultValue) {
      normalized[key] = incomingValue as typeof defaultValue
    }
  })

  return normalized
}

export const loadConfig = async (): Promise<ConfigPayload | null> => {
  const payload = await implLoad()
  if (!payload) return null
  return normalizeConfigPayload(payload)
}

export const saveConfig = async (payload: ConfigPayload): Promise<void> => {
  const normalized = normalizeConfigPayload(payload)
  await implSave(normalized)
}

export const clearConfig = async (): Promise<void> => implClear()
