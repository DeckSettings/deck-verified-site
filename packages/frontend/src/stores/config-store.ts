import { acceptHMRUpdate, defineStore } from 'pinia'
import { reactive, ref, toRef, watch } from 'vue'
import { loadConfig, saveConfig } from 'src/utils/config'
import type { ConfigPayload } from 'src/utils/config'

interface ConfigState {
  hideDuplicateReports: boolean;
}

const DEFAULTS: ConfigState = {
  hideDuplicateReports: false,
}

export const useConfigStore = defineStore('config', () => {
  const state = reactive<ConfigState>({ ...DEFAULTS })
  const isHydrated = ref(false)

  const hideDuplicateReports = toRef(state, 'hideDuplicateReports')

  const setHideDuplicateReports = (value: boolean) => {
    hideDuplicateReports.value = value
  }

  const toggleHideDuplicateReports = () => {
    hideDuplicateReports.value = !hideDuplicateReports.value
  }

  const hydrate = async () => {
    if (typeof window === 'undefined') {
      isHydrated.value = true
      return
    }
    try {
      const result = await loadConfig()
      if (result) {
        Object.assign(state, normalizePayload(result))
      }
    } catch (error) {
      console.warn('[config-store] Failed to hydrate', error)
    } finally {
      isHydrated.value = true
    }
  }

  void hydrate()

  watch(
    hideDuplicateReports,
    async (value) => {
      if (!isHydrated.value) return
      const payload: ConfigPayload = {
        hideDuplicateReports: value,
      }
      try {
        await saveConfig(payload)
      } catch (error) {
        console.warn('[config-store] Failed to persist', error)
      }
    },
  )

  return {
    hideDuplicateReports,
    setHideDuplicateReports,
    toggleHideDuplicateReports,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useConfigStore, import.meta.hot))
}

function normalizePayload(payload: Partial<ConfigPayload>): ConfigState {
  return {
    hideDuplicateReports: typeof payload.hideDuplicateReports === 'boolean'
      ? payload.hideDuplicateReports
      : DEFAULTS.hideDuplicateReports,
  }
}
