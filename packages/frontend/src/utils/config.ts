import type { ConfigPayload } from 'src/utils/config/types'
import {
  loadConfig as implLoad,
  saveConfig as implSave,
  clearConfig as implClear,
} from '@app/config'

export type { ConfigPayload }

export const loadConfig = async (): Promise<ConfigPayload | null> => implLoad()

export const saveConfig = async (payload: ConfigPayload): Promise<void> => implSave(payload)

export const clearConfig = async (): Promise<void> => implClear()
