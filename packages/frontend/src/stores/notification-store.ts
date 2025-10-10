import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { featureFlags } from 'src/composables/useFeatureFlags'
import { useAuthStore } from 'stores/auth-store'
import type { NotificationEnvelope, PersistedNotification, UserNotification } from '../../../shared/src/notifications'
import { useQuasar } from 'quasar'
import type { QNotifyCreateOptions } from 'quasar'
import { apiUrl, fetchService } from 'src/utils/api'
import type { FetchServiceResponse } from 'src/utils/api'

/** async delay helper. */
const delay = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const POLL_BACKOFF_MS = 5_000
const POLL_BASE_INTERVAL_MS = 60_000
const POLL_MAX_INTERVAL_MS = 5 * 60_000
const POLL_JITTER_MS = 15_000
const DATA_STALE_THRESHOLD_MS = 60_000
const LOCK_TTL_MS = 120_000
const LOCK_RETRY_INTERVAL_MS = 100
const LOCK_ACQUIRE_TIMEOUT_MS = 2_000
const STORAGE_PREFIX = 'dv_notifications'
const STORAGE_LOCK_KEY = 'dv_notifications_poll_lock'

interface NotificationState {
  notifications: PersistedNotification[]
  initialized: boolean
}

/** Builds the localStorage key used to sync notifications per user. */
const buildStorageKey = (userId: number | null | undefined): string => (
  userId === null || userId === undefined ? STORAGE_PREFIX : `${STORAGE_PREFIX}_${userId}`
)

/** Normalizes raw notification records loaded from storage/network into the shared shape. */
const normalizeNotifications = (raw: unknown): PersistedNotification[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Partial<PersistedNotification>
      if (typeof record.id !== 'string' || !record.id) return null
      if (typeof record.icon !== 'string' || typeof record.title !== 'string' || typeof record.body !== 'string') return null
      const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now()
      const normalized: PersistedNotification = {
        id: record.id,
        icon: record.icon,
        title: record.title,
        body: record.body,
        createdAt,
        variant: typeof record.variant === 'string' && record.variant ? record.variant : 'white',
      }
      if (typeof record.link === 'string' && record.link) normalized.link = record.link
      if (typeof record.linkTooltip === 'string' && record.linkTooltip) normalized.linkTooltip = record.linkTooltip
      return normalized
    })
    .filter((entry): entry is PersistedNotification => entry !== null)
}

const cloneNotification = (notification: PersistedNotification): PersistedNotification => {
  const clone: PersistedNotification = {
    id: notification.id,
    icon: notification.icon,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt,
    variant: notification.variant ?? 'white',
  }
  if (notification.link) clone.link = notification.link
  if (notification.linkTooltip) clone.linkTooltip = notification.linkTooltip
  return clone
}

/** Parses an envelope JSON string from storage into a NotificationEnvelope. */
const parseEnvelopeFromStorage = (raw: string | null): NotificationEnvelope | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationEnvelope>
    const notifications = normalizeNotifications(parsed?.notifications ?? [])
    if (notifications.length === 0 && !parsed?.updatedAt) {
      return null
    }
    const updatedAt = typeof parsed?.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
      ? parsed.updatedAt
      : 0
    return { notifications, updatedAt }
  } catch {
    return null
  }
}

const readEnvelopeFromStorage = (key: string): NotificationEnvelope | null => {
  if (typeof window === 'undefined') return null
  try {
    return parseEnvelopeFromStorage(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

const writeEnvelopeToStorage = (key: string, envelope: NotificationEnvelope): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    // Swallow persistence errors to avoid disrupting the UX
  }
}

const removeEnvelopeFromStorage = (key: string): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Generates a random owner token for the cross-tab polling lock. */
const generateLockOwner = () => `notif_lock_${Math.random().toString(36).slice(2)}`

/** Reads the lock record stored in localStorage, if present. */
const getLockRecord = (): { owner: string; until: number } | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_LOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { owner?: unknown; until?: unknown }
    if (typeof parsed?.owner === 'string' && typeof parsed?.until === 'number') {
      return { owner: parsed.owner, until: parsed.until }
    }
    window.localStorage.removeItem(STORAGE_LOCK_KEY)
    return null
  } catch {
    window.localStorage.removeItem(STORAGE_LOCK_KEY)
    return null
  }
}

const setLockRecord = (owner: string, until: number) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify({ owner, until }))
}

/** Attempts to acquire the polling lock for the given owner. */
const acquireNotificationLock = (owner: string): boolean => {
  if (typeof window === 'undefined') return true
  try {
    const now = Date.now()
    const existing = getLockRecord()
    if (existing && existing.owner !== owner && existing.until > now) {
      return false
    }
    setLockRecord(owner, now + LOCK_TTL_MS)
    const confirmation = getLockRecord()
    return !!confirmation && confirmation.owner === owner
  } catch {
    return false
  }
}

const releaseNotificationLock = (owner: string): void => {
  if (typeof window === 'undefined') return
  try {
    const current = getLockRecord()
    if (!current || current.owner !== owner) return
    window.localStorage.removeItem(STORAGE_LOCK_KEY)
  } catch {
    window.localStorage.removeItem(STORAGE_LOCK_KEY)
  }
}

const withNotificationLock = async <T>(fn: () => Promise<T>): Promise<{ locked: boolean; result?: T }> => {
  if (typeof window === 'undefined') {
    return { locked: true, result: await fn() }
  }

  const owner = generateLockOwner()
  const start = Date.now()

  while (!acquireNotificationLock(owner)) {
    if (Date.now() - start > LOCK_ACQUIRE_TIMEOUT_MS) {
      return { locked: false }
    }
    await delay(LOCK_RETRY_INTERVAL_MS)
  }

  try {
    const result = await fn()
    return { locked: true, result }
  } finally {
    releaseNotificationLock(owner)
  }
}

export const useNotificationStore = defineStore('notifications', () => {
  const state = ref<NotificationState>({ notifications: [], initialized: false })
  const lastUpdatedAt = ref(0)
  const polling = ref(false)
  const abortController = ref<AbortController | null>(null)
  const seenNotificationIds = new Set<string>()

  let storageListener: ((event: StorageEvent) => void) | null = null

  const authStore = useAuthStore()
  const storageKey = computed(() => buildStorageKey(authStore.user?.id))
  const isFeatureActive = computed(() => featureFlags.enableLogin && authStore.isLoggedIn)
  const $q = typeof window !== 'undefined' ? useQuasar() : null

  const notifications = computed(() => state.value.notifications)
  const hasNotifications = computed(() => notifications.value.length > 0)

  /** Persists the provided envelope (or clears it) in localStorage. */
  const persistEnvelope = (envelope: NotificationEnvelope | null) => {
    if (typeof window === 'undefined') return
    if (!envelope) {
      removeEnvelopeFromStorage(storageKey.value)
      return
    }
    writeEnvelopeToStorage(storageKey.value, envelope)
  }

  const toastColorForVariant = (variant?: string): string | undefined => {
    switch (variant) {
      case 'positive':
        return 'positive'
      case 'negative':
        return 'negative'
      case 'warning':
        return 'warning'
      case 'info':
        return 'primary'
      default:
        return undefined
    }
  }

  const showToastForNotification = (notification: PersistedNotification) => {
    if (!$q) return
    const options: QNotifyCreateOptions = {
      message: notification.title,
      caption: notification.body,
      icon: notification.icon,
      timeout: 2000,
    }
    const color = toastColorForVariant(notification.variant)
    if (color) {
      options.color = color
    }
    $q.notify(options)
  }

  /** Applies an envelope to the store and optionally persists it. */
  const applyEnvelope = (envelope: NotificationEnvelope | null, persist: boolean, silent: boolean = false): boolean => {
    if (!isFeatureActive.value) {
      state.value.notifications = []
      state.value.initialized = false
      lastUpdatedAt.value = 0
      if (persist) persistEnvelope(null)
      seenNotificationIds.clear()
      return false
    }

    if (!envelope) {
      state.value.notifications = []
      state.value.initialized = false
      lastUpdatedAt.value = 0
      if (persist) persistEnvelope(null)
      seenNotificationIds.clear()
      return false
    }

    const previousIds = new Set(state.value.notifications.map((n) => n.id))
    const newlySeen: PersistedNotification[] = []

    const updatedAt = typeof envelope.updatedAt === 'number' && Number.isFinite(envelope.updatedAt) && envelope.updatedAt > 0
      ? envelope.updatedAt
      : Date.now()
    const normalized: NotificationEnvelope = {
      updatedAt,
      notifications: envelope.notifications.map(cloneNotification),
    }

    state.value.notifications = normalized.notifications
    state.value.initialized = true
    lastUpdatedAt.value = normalized.updatedAt

    if (persist) {
      persistEnvelope(normalized)
    }

    for (const notification of normalized.notifications) {
      if (!previousIds.has(notification.id) && !seenNotificationIds.has(notification.id)) {
        newlySeen.push(notification)
      }
      seenNotificationIds.add(notification.id)
    }

    if (!silent) {
      newlySeen.forEach(showToastForNotification)
    }

    return newlySeen.length > 0
  }

  /** Hydrates state from the most recent envelope stored in localStorage. */
  const hydrateFromStorage = () => {
    if (!isFeatureActive.value) return
    const storedEnvelope = readEnvelopeFromStorage(storageKey.value)
    if (storedEnvelope) {
      applyEnvelope(storedEnvelope, false, true)
    } else {
      state.value.initialized = false
    }
  }

  /** Resets in-memory notifications (and optionally clears localStorage). */
  const resetState = (clearStorage: boolean = false) => {
    state.value = { notifications: [], initialized: false }
    lastUpdatedAt.value = 0
    seenNotificationIds.clear()
    if (clearStorage) {
      persistEnvelope(null)
    }
  }

  /** Cancels the in-flight polling request, if any. */
  const stopPolling = () => {
    abortController.value?.abort()
    abortController.value = null
    polling.value = false
  }

  /** Subscribes to cross-tab localStorage updates for this user. */
  const attachStorageListener = () => {
    if (typeof window === 'undefined' || storageListener) return
    storageListener = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return
      if (event.key !== storageKey.value) return
      const envelope = parseEnvelopeFromStorage(event.newValue)
      applyEnvelope(envelope, false)
    }
    window.addEventListener('storage', storageListener)
  }

  /** Removes the localStorage subscription when polling is disabled. */
  const detachStorageListener = () => {
    if (typeof window === 'undefined' || !storageListener) return
    window.removeEventListener('storage', storageListener)
    storageListener = null
  }

  /** Wraps fetch with the current DV token attached in the Authorization header. */
  const fetchWithDvToken = async (url: string, init: RequestInit = {}): Promise<FetchServiceResponse> => {
    const token = await authStore.ensureInternalToken()
    if (!token) {
      throw new Error('missing_dv_token')
    }

    const headers = new Headers(init.headers ?? {})
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return fetchService(url, { ...init, headers })
  }

  /** Applies server responses or handles auth errors / unexpected status codes. */
  const handleEnvelopeResponse = async (response: FetchServiceResponse): Promise<boolean> => {
    if (response.status === 401) {
      authStore.logout()
      resetState(true)
      return false
    }
    if (!response.ok) {
      throw new Error(`notification_request_failed_${response.status}`)
    }
    const envelope = await response.json() as NotificationEnvelope
    return applyEnvelope(envelope, true)
  }

  /** Primary polling loop, guarded by the cross-tab lock to avoid duplicate requests. */
  const pollNotifications = async (): Promise<void> => {
    if (polling.value || !isFeatureActive.value) return
    polling.value = true

    let nextDelayMs = POLL_BASE_INTERVAL_MS

    while (polling.value && isFeatureActive.value) {
      hydrateFromStorage()

      const since = lastUpdatedAt.value > 0 ? lastUpdatedAt.value : null
      let acquired = false
      let hasNewNotifications = false
      try {
        const result = await withNotificationLock(async () => {
          const query = since ? `?since=${since}` : ''
          const controller = new AbortController()
          abortController.value = controller
          try {
            const response = await fetchWithDvToken(apiUrl(`/deck-verified/api/dv/notifications${query}`), { signal: controller.signal })
            if (controller.signal.aborted) return false
            return await handleEnvelopeResponse(response)
          } finally {
            abortController.value = null
          }
        })
        acquired = result.locked
        hasNewNotifications = Boolean(result.result)
      } catch (error) {
        console.error('[useNotificationStore] Polling loop error', error)
        nextDelayMs = Math.min(nextDelayMs * 2, POLL_MAX_INTERVAL_MS)
        await delay(POLL_BACKOFF_MS)
        continue
      }

      if (!acquired) {
        const stale = Date.now() - lastUpdatedAt.value > DATA_STALE_THRESHOLD_MS
        await delay(stale ? 250 : 1_000)
        continue
      }

      if (hasNewNotifications) {
        nextDelayMs = POLL_BASE_INTERVAL_MS
      } else if (state.value.notifications.length === 0) {
        nextDelayMs = Math.min(Math.max(nextDelayMs * 2, POLL_BASE_INTERVAL_MS), POLL_MAX_INTERVAL_MS)
      }

      const jitter = Math.floor(Math.random() * POLL_JITTER_MS)
      await delay(nextDelayMs + jitter)
    }

    polling.value = false
  }

  /** Restarts the polling loop after mutating operations (push/dismiss). */
  const triggerPollingRestart = () => {
    if (!isFeatureActive.value) return
    stopPolling()
    void pollNotifications()
  }

  /** Deletes every stored notification for the signed-in user. */
  const dismissAll = async (): Promise<void> => {
    if (!isFeatureActive.value) return
    try {
      const response = await fetchWithDvToken(apiUrl('/deck-verified/api/dv/notifications'), { method: 'DELETE' })
      await handleEnvelopeResponse(response)
    } catch (error) {
      console.error('[useNotificationStore] Failed to clear notifications', error)
    } finally {
      triggerPollingRestart()
    }
  }

  /** Removes a single notification by identifier. */
  const dismissNotification = async (id: string): Promise<void> => {
    if (!isFeatureActive.value) return
    try {
      const response = await fetchWithDvToken(apiUrl(`/deck-verified/api/dv/notifications/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      })
      await handleEnvelopeResponse(response)
    } catch (error) {
      console.error('[useNotificationStore] Failed to dismiss notification', error)
    } finally {
      triggerPollingRestart()
    }
  }

  /** Appends a notification for the current user and refreshes local state. */
  const pushNotification = async (notification: UserNotification): Promise<void> => {
    if (!isFeatureActive.value) return
    try {
      const response = await fetchWithDvToken(apiUrl('/deck-verified/api/dv/notifications'), {
        method: 'PUT',
        body: JSON.stringify({ notification }),
      })
      await handleEnvelopeResponse(response)
    } catch (error) {
      console.error('[useNotificationStore] Failed to push notification', error)
    } finally {
      triggerPollingRestart()
    }
  }

  watch(isFeatureActive, (active) => {
    if (active) {
      hydrateFromStorage()
      attachStorageListener()
      void pollNotifications()
    } else {
      stopPolling()
      detachStorageListener()
      resetState(true)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_LOCK_KEY)
      }
    }
  }, { immediate: true })

  watch(storageKey, (newKey, oldKey) => {
    if (typeof window === 'undefined') return
    if (oldKey && oldKey !== newKey) {
      removeEnvelopeFromStorage(oldKey)
    }
    if (isFeatureActive.value) {
      hydrateFromStorage()
    }
  })

  return {
    notifications,
    hasNotifications,
    pushNotification,
    dismissNotification,
    dismissAll,
    refresh: triggerPollingRestart,
  }
})

export type { UserNotification } from '../../../shared/src/notifications'
