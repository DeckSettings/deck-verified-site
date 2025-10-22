import type { ConfigPayload } from 'src/utils/config/types'
import {
  loadConfig as implLoad,
  saveConfig as implSave,
  clearConfig as implClear,
} from '@app/config'

export type { ConfigPayload }

export const DEFAULT_CONFIG: ConfigPayload = {
  hideDuplicateReports: false,
  disabledFeeds: [],
}

export const normalizeConfigPayload = (payload: Partial<ConfigPayload> | null | undefined): ConfigPayload => {
  const normalized: ConfigPayload = {
    hideDuplicateReports: DEFAULT_CONFIG.hideDuplicateReports,
    disabledFeeds: [...DEFAULT_CONFIG.disabledFeeds],
  }

  if (!payload || typeof payload !== 'object') {
    return normalized
  }

  const record = payload as Partial<ConfigPayload>

  if (typeof record.hideDuplicateReports === 'boolean') {
    normalized.hideDuplicateReports = record.hideDuplicateReports
  }
  if (Array.isArray(record.disabledFeeds)) {
    normalized.disabledFeeds = record.disabledFeeds.filter((value): value is string => true)
  }

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
