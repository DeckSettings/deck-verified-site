import type { ConfigPayload } from 'src/utils/config/types'
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY } from 'src/utils/config/types'
import {
  loadConfig as implLoad,
  saveConfig as implSave,
  clearConfig as implClear,
} from '@app/config'

export type { ConfigPayload }

export const DEFAULT_CONFIG: ConfigPayload = {
  hideDuplicateReports: false,
  showHomeWelcomeCard: true,
  disabledFeeds: [],
  country: DEFAULT_COUNTRY,
  currency: DEFAULT_CURRENCY,
}

export const normalizeConfigPayload = (payload: Partial<ConfigPayload> | null | undefined): ConfigPayload => {
  const normalized: ConfigPayload = {
    hideDuplicateReports: DEFAULT_CONFIG.hideDuplicateReports,
    showHomeWelcomeCard: DEFAULT_CONFIG.showHomeWelcomeCard,
    disabledFeeds: [...DEFAULT_CONFIG.disabledFeeds],
    country: DEFAULT_CONFIG.country,
    currency: DEFAULT_CONFIG.currency,
  }

  if (!payload || typeof payload !== 'object') {
    return normalized
  }

  const record = payload as Partial<ConfigPayload>

  if (typeof record.hideDuplicateReports === 'boolean') {
    normalized.hideDuplicateReports = record.hideDuplicateReports
  }
  if (typeof record.showHomeWelcomeCard === 'boolean') {
    normalized.showHomeWelcomeCard = record.showHomeWelcomeCard
  }
  if (Array.isArray(record.disabledFeeds)) {
    normalized.disabledFeeds = record.disabledFeeds.filter((value): value is string => true)
  }

  if (typeof record.country === 'string' && record.country.trim() !== '') {
    normalized.country = record.country
  }

  if (typeof record.currency === 'string' && record.currency.trim() !== '') {
    normalized.currency = record.currency
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
