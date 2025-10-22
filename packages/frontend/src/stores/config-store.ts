import { acceptHMRUpdate, defineStore } from 'pinia'
import { reactive, ref, toRef, watch } from 'vue'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from 'src/utils/config'
import type { ConfigPayload } from 'src/utils/config'

export const useConfigStore = defineStore('config', () => {
  const state = reactive<ConfigPayload>({
    hideDuplicateReports: DEFAULT_CONFIG.hideDuplicateReports,
    disabledFeeds: [...DEFAULT_CONFIG.disabledFeeds],
  })
  const isHydrated = ref(false)

  const hideDuplicateReports = toRef(state, 'hideDuplicateReports')
  const disabledFeeds = toRef(state, 'disabledFeeds')

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
        state.hideDuplicateReports = result.hideDuplicateReports
        state.disabledFeeds = [...result.disabledFeeds]
      } else {
        state.hideDuplicateReports = DEFAULT_CONFIG.hideDuplicateReports
        state.disabledFeeds = [...DEFAULT_CONFIG.disabledFeeds]
      }
    } catch (error) {
      console.warn('[config-store] Failed to hydrate', error)
    } finally {
      isHydrated.value = true
    }
  }

  void hydrate()

  const setFeedDisabled = (key: string, disabled: boolean) => {
    const current = new Set(disabledFeeds.value)
    if (disabled) {
      current.add(key)
    } else {
      current.delete(key)
    }
    state.disabledFeeds = Array.from(current)
  }

  const isFeedDisabled = (key: string) => disabledFeeds.value.includes(key)

  watch(
    () => ({
      hideDuplicateReports: state.hideDuplicateReports,
      disabledFeeds: state.disabledFeeds,
    }),
    async (value) => {
      if (!isHydrated.value) return
      const payload: ConfigPayload = {
        hideDuplicateReports: value.hideDuplicateReports,
        disabledFeeds: [...value.disabledFeeds],
      }
      try {
        await saveConfig(payload)
      } catch (error) {
        console.warn('[config-store] Failed to persist', error)
      }
    },
    { deep: true },
  )

  return {
    hideDuplicateReports,
    setHideDuplicateReports,
    toggleHideDuplicateReports,
    disabledFeeds,
    setFeedDisabled,
    isFeedDisabled,
    isHydrated,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useConfigStore, import.meta.hot))
}
