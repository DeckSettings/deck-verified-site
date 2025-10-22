declare module '@app/config' {
  import type { ConfigPayload } from 'src/utils/config/types'

  export const loadConfig: () => Promise<Partial<ConfigPayload> | null>
  export const saveConfig: (payload: ConfigPayload) => Promise<void>
  export const clearConfig: () => Promise<void>
}
