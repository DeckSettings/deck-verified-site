import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { featureFlags } from 'src/composables/useFeatureFlags'
import { useAuthStore } from 'stores/auth-store'

/**
 * Lightweight payload describing a user notification rendered in the UI.
 */
export interface UserNotification {
  icon: string
  title: string
  body: string
}

interface PersistedNotification extends UserNotification {
  id: string
  createdAt: number
}

interface NotificationState {
  notifications: PersistedNotification[]
  initialized: boolean
}

const STORAGE_PREFIX = 'dv_notifications'

const buildStorageKey = (userId: number | null | undefined): string => {
  if (userId === null || userId === undefined) {
    return STORAGE_PREFIX
  }
  return `${STORAGE_PREFIX}_${userId}`
}

const parseStoredNotifications = (raw: unknown): PersistedNotification[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null
      const record = entry as Partial<PersistedNotification>
      if (typeof record.icon !== 'string' || typeof record.title !== 'string' || typeof record.body !== 'string') {
        return null
      }
      const id = typeof record.id === 'string' && record.id ? record.id : createNotificationId()
      const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now()
      return {
        icon: record.icon,
        title: record.title,
        body: record.body,
        id,
        createdAt,
      }
    })
    .filter((entry): entry is PersistedNotification => entry !== null)
}

const createNotificationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `notif_${Math.random().toString(36).slice(2, 11)}`
}

const readFromStorage = (key: string): PersistedNotification[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    return parseStoredNotifications(JSON.parse(raw))
  } catch {
    window.localStorage.removeItem(key)
    return []
  }
}

const writeToStorage = (key: string, notifications: PersistedNotification[]): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(notifications))
  } catch {
    // Failing to persist should not disrupt the user experience.
  }
}

/**
 * Pinia store coordinating user notifications with localStorage persistence.
 */
export const useNotificationStore = defineStore('notifications', () => {
  const state = ref<NotificationState>({ notifications: [], initialized: false })

  const authStore = useAuthStore()

  const isFeatureActive = computed(() => featureFlags.enableLogin && authStore.isLoggedIn)

  const storageKey = computed(() => buildStorageKey(authStore.user?.id))

  const hydrateFromStorage = () => {
    if (!isFeatureActive.value || state.value.initialized) return
    state.value.notifications = readFromStorage(storageKey.value)
    state.value.initialized = true
  }

  const persistState = () => {
    if (!isFeatureActive.value) return
    writeToStorage(storageKey.value, state.value.notifications)
  }

  const resetState = () => {
    state.value = { notifications: [], initialized: false }
  }

  watch(isFeatureActive, (active) => {
    if (active) {
      hydrateFromStorage()
    } else {
      resetState()
    }
  }, { immediate: true })

  watch(storageKey, () => {
    if (!isFeatureActive.value) return
    state.value.notifications = readFromStorage(storageKey.value)
    state.value.initialized = true
  })

  const notifications = computed(() => state.value.notifications)
  const hasNotifications = computed(() => notifications.value.length > 0)

  /**
   * Pushes a notification into the queue and persists it for later sessions.
   */
  const pushNotification = (notification: UserNotification): void => {
    if (!isFeatureActive.value) return
    hydrateFromStorage()
    const entry: PersistedNotification = {
      ...notification,
      id: createNotificationId(),
      createdAt: Date.now(),
    }
    state.value.notifications = [entry, ...state.value.notifications]
    persistState()
  }

  /**
   * Removes a single notification by identifier.
   */
  const dismissNotification = (id: string): void => {
    if (!isFeatureActive.value) return
    hydrateFromStorage()
    state.value.notifications = state.value.notifications.filter((entry) => entry.id !== id)
    persistState()
  }

  /**
   * Clears every active notification from memory and persistence.
   */
  const dismissAll = (): void => {
    if (!isFeatureActive.value) return
    hydrateFromStorage()
    state.value.notifications = []
    persistState()
  }

  return {
    notifications,
    hasNotifications,
    pushNotification,
    dismissNotification,
    dismissAll,
  }
})
