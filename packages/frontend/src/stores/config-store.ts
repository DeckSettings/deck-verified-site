import { acceptHMRUpdate, defineStore } from 'pinia'
import { reactive, ref, toRef, watch } from 'vue'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from 'src/utils/config'
import type { ConfigPayload } from 'src/utils/config'

const cloneConfig = (config: ConfigPayload): ConfigPayload => ({
  hideDuplicateReports: config.hideDuplicateReports,
  showHomeWelcomeCard: config.showHomeWelcomeCard,
  disabledFeeds: [...config.disabledFeeds],
  country: config.country,
  currency: config.currency,
})

const resolveInitialConfig = async (): Promise<{ state: ConfigPayload; hydrated: boolean }> => {
  const fallback = cloneConfig(DEFAULT_CONFIG)

  if (typeof window === 'undefined') {
    return { state: fallback, hydrated: false }
  }

  try {
    const result = await loadConfig()
    if (!result) {
      return { state: fallback, hydrated: true }
    }
    return { state: cloneConfig(result), hydrated: true }
  } catch (error) {
    console.warn('[config-store] Failed to resolve initial config', error)
    return { state: fallback, hydrated: false }
  }
}

const initial = await resolveInitialConfig()

export const useConfigStore = defineStore('config', () => {
  const state = reactive<ConfigPayload>(cloneConfig(initial.state))
  const isHydrated = ref(typeof window === 'undefined' ? true : initial.hydrated)

  const hideDuplicateReports = toRef(state, 'hideDuplicateReports')
  const showHomeWelcomeCard = toRef(state, 'showHomeWelcomeCard')
  const disabledFeeds = toRef(state, 'disabledFeeds')
  const country = toRef(state, 'country')
  const currency = toRef(state, 'currency')

  const setHideDuplicateReports = (value: boolean) => {
    hideDuplicateReports.value = value
  }

  const setShowHomeWelcomeCard = (value: boolean) => {
    showHomeWelcomeCard.value = value
  }

  const toggleHideDuplicateReports = () => {
    hideDuplicateReports.value = !hideDuplicateReports.value
  }

  const toggleShowHomeWelcomeCard = () => {
    showHomeWelcomeCard.value = !showHomeWelcomeCard.value
  }

  const setCountry = (value: string) => {
    country.value = value
  }

  const setCurrency = (value: string) => {
    currency.value = value
  }

  const hydrate = async () => {
    if (typeof window === 'undefined') {
      isHydrated.value = true
      return
    }
    if (initial.hydrated) {
      return
    }
    try {
      const result = await loadConfig()
      if (result) {
        state.hideDuplicateReports = result.hideDuplicateReports
        state.showHomeWelcomeCard = result.showHomeWelcomeCard
        state.disabledFeeds = [...result.disabledFeeds]
        state.country = typeof result.country === 'string' ? result.country : DEFAULT_CONFIG.country
        state.currency = typeof result.currency === 'string' ? result.currency : DEFAULT_CONFIG.currency
      } else {
        state.hideDuplicateReports = DEFAULT_CONFIG.hideDuplicateReports
        state.showHomeWelcomeCard = DEFAULT_CONFIG.showHomeWelcomeCard
        state.disabledFeeds = [...DEFAULT_CONFIG.disabledFeeds]
        state.country = DEFAULT_CONFIG.country
        state.currency = DEFAULT_CONFIG.currency
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
      showHomeWelcomeCard: state.showHomeWelcomeCard,
      disabledFeeds: state.disabledFeeds,
      country: state.country,
      currency: state.currency,
    }),
    async (value) => {
      if (!isHydrated.value) return
      const payload: ConfigPayload = {
        hideDuplicateReports: value.hideDuplicateReports,
        showHomeWelcomeCard: value.showHomeWelcomeCard,
        disabledFeeds: [...value.disabledFeeds],
        country: typeof value.country === 'string' ? value.country : DEFAULT_CONFIG.country,
        currency: typeof value.currency === 'string' ? value.currency : DEFAULT_CONFIG.currency,
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
    showHomeWelcomeCard,
    setShowHomeWelcomeCard,
    toggleShowHomeWelcomeCard,
    disabledFeeds,
    setFeedDisabled,
    isFeedDisabled,
    country,
    setCountry,
    currency,
    setCurrency,
    isHydrated,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useConfigStore, import.meta.hot))
}
