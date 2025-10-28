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

interface InitialConfigState {
  state: ConfigPayload
  hydrated: boolean
}

const createInitialState = (config: ConfigPayload, hydrated: boolean): InitialConfigState => ({
  state: cloneConfig(config),
  hydrated,
})

const defaultInitialState = (): InitialConfigState =>
  createInitialState(DEFAULT_CONFIG, typeof window === 'undefined')

let resolvedInitial: InitialConfigState | null = typeof window === 'undefined' ? defaultInitialState() : null
let initialPromise: Promise<InitialConfigState> | null = null

const resolveInitialConfig = async (): Promise<InitialConfigState> => {
  const fallback = defaultInitialState()

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const result = await loadConfig()
    if (!result) {
      return createInitialState(DEFAULT_CONFIG, true)
    }
    return createInitialState(result, true)
  } catch (error) {
    console.warn('[config-store] Failed to resolve initial config', error)
    return createInitialState(DEFAULT_CONFIG, false)
  }
}

const ensureInitialConfig = async (): Promise<InitialConfigState> => {
  if (resolvedInitial?.hydrated) {
    return resolvedInitial
  }

  if (!initialPromise) {
    initialPromise = resolveInitialConfig().then((result) => {
      resolvedInitial = result
      initialPromise = null
      return result
    })
  }

  return initialPromise
}

if (typeof window !== 'undefined') {
  void ensureInitialConfig()
}

export const useConfigStore = defineStore('config', () => {
  const baseInitial = resolvedInitial ?? defaultInitialState()
  const state = reactive<ConfigPayload>(cloneConfig(baseInitial.state))
  const isHydrated = ref(baseInitial.hydrated)

  const hideDuplicateReports = toRef(state, 'hideDuplicateReports')
  const showHomeWelcomeCard = toRef(state, 'showHomeWelcomeCard')
  const disabledFeeds = toRef(state, 'disabledFeeds')
  const country = toRef(state, 'country')
  const currency = toRef(state, 'currency')

  const applyConfig = (config: ConfigPayload) => {
    state.hideDuplicateReports = config.hideDuplicateReports
    state.showHomeWelcomeCard = config.showHomeWelcomeCard
    state.disabledFeeds = [...config.disabledFeeds]
    state.country = config.country
    state.currency = config.currency
  }

  if (!resolvedInitial && typeof window !== 'undefined') {
    void ensureInitialConfig().then(({ state: initialState, hydrated }) => {
      applyConfig(initialState)
      isHydrated.value = hydrated
    })
  }

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
    try {
      if (resolvedInitial?.hydrated) {
        applyConfig(resolvedInitial.state)
        isHydrated.value = true
        return
      }
      const result = await ensureInitialConfig()
      applyConfig(result.state)
      isHydrated.value = result.hydrated
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
