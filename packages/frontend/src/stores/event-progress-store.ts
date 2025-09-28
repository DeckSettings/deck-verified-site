import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from 'stores/auth-store'
import { useProgressNotifications } from 'src/composables/useProgressNotifications'
import type { ProgressNotificationHandle } from 'src/composables/useProgressNotifications'
import { useNotificationStore } from 'stores/notification-store'

/**
 * Shape returned by the backend progress endpoint.
 * Mirrors packages/backend/src/redis.ts: EventProgressState
 */
export interface EventProgressPayload {
  eventId: string
  status: string
  icon: string | null
  title: string
  message: string
  progress: number | 'indeterminate' | null
  done: boolean
  variant?: string
  updatedAt: number
  revision: string
}

/** Async delay helper. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** LocalStorage keys and constants */
const PENDING_EVENTS_KEY = 'dv_pending_events'
const PENDING_EVENTS_TTL_MS = 10 * 60 * 1000 // 10 minutes

const PROGRESS_STORAGE_PREFIX = 'dv_event_progress:'

/** Single-leader per-event cross-tab lock keys and constants */
const LEADER_LOCK_KEY_PREFIX = 'dv_event_leader:'
const LEADER_LOCK_TTL_MS = 30_000 // 30 seconds
const LEADER_RETRY_INTERVAL_MS = 1_500

/** Compose the lock key for an event */
const leaderLockKey = (eventId: string) => `${LEADER_LOCK_KEY_PREFIX}${eventId}`
/** Compose the progress storage key for an event */
const progressStorageKey = (eventId: string) => `${PROGRESS_STORAGE_PREFIX}${eventId}`

/** Generate a random owner token for a leader record */
const generateLeaderOwner = () => `evt_leader_${Math.random().toString(36).slice(2)}`

/** Cross-tab leader lock helpers */
const getLeaderRecord = (eventId: string): { owner: string; until: number } | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(leaderLockKey(eventId))
    if (!raw) return null
    const obj = JSON.parse(raw) as { owner?: unknown; until?: unknown }
    if (typeof obj?.owner === 'string' && typeof obj?.until === 'number') {
      return { owner: obj.owner, until: obj.until }
    }
    window.localStorage.removeItem(leaderLockKey(eventId))
    return null
  } catch {
    window.localStorage.removeItem(leaderLockKey(eventId))
    return null
  }
}
const setLeaderRecord = (eventId: string, owner: string, until: number) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(leaderLockKey(eventId), JSON.stringify({ owner, until }))
  } catch {
    // ignore
  }
}
const acquireLeaderLock = (eventId: string, owner: string): boolean => {
  if (typeof window === 'undefined') return true
  const now = Date.now()
  const existing = getLeaderRecord(eventId)
  if (existing && existing.owner !== owner && existing.until > now) {
    return false
  }
  setLeaderRecord(eventId, owner, now + LEADER_LOCK_TTL_MS)
  const confirm = getLeaderRecord(eventId)
  return !!confirm && confirm.owner === owner
}
const renewLeaderLock = (eventId: string, owner: string): void => {
  if (typeof window === 'undefined') return
  const now = Date.now()
  const rec = getLeaderRecord(eventId)
  if (rec && rec.owner === owner) {
    setLeaderRecord(eventId, owner, now + LEADER_LOCK_TTL_MS)
  }
}
const releaseLeaderLock = (eventId: string, owner: string): void => {
  if (typeof window === 'undefined') return
  try {
    const cur = getLeaderRecord(eventId)
    if (cur && cur.owner !== owner) return
    window.localStorage.removeItem(leaderLockKey(eventId))
  } catch {
    window.localStorage.removeItem(leaderLockKey(eventId))
  }
}

/** Pending events stored with TTL (array of { id, expiresAt }) */
const readPendingEvents = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PENDING_EVENTS_KEY)
    if (!raw) return []
    const now = Date.now()
    const arr = JSON.parse(raw)
    let entries: { id: string; expiresAt: number }[] = []
    if (Array.isArray(arr)) {
      // Expect the new format only: [{ id: string, expiresAt: number }]
      // If invalid, discard by leaving entries empty; caller will clear persisted data below.
      const maybeEntries = (arr as unknown[]).filter((e): e is { id: string; expiresAt: number } => {
        return !!e
          && typeof e === 'object'
          && typeof (e as { id: unknown }).id === 'string'
          && typeof (e as { expiresAt: unknown }).expiresAt === 'number'
      })
      entries = maybeEntries.map((e) => ({ id: e.id, expiresAt: e.expiresAt }))
    }
    // prune expired; if nothing valid and parsed array was invalid, clear storage
    const valid = entries.filter((e) => typeof e.id === 'string' && e.id.length > 0 && e.expiresAt > now)
    try {
      if (valid.length > 0) {
        window.localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(valid))
      } else {
        window.localStorage.removeItem(PENDING_EVENTS_KEY)
      }
    } catch {
      // ignore persistence failure
    }
    return valid.map((e) => e.id)
  } catch {
    // parsing failed; clear storage since we don't support older formats
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(PENDING_EVENTS_KEY)
    } catch {
      // ignore
    }
    return []
  }
}
const writePendingEvents = (ids: string[]) => {
  if (typeof window === 'undefined') return
  try {
    const now = Date.now()
    const unique = Array.from(new Set(ids.filter((v) => typeof v === 'string' && v.length > 0)))
    const entries = unique.map((id) => ({ id, expiresAt: now + PENDING_EVENTS_TTL_MS }))
    window.localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(entries))
  } catch {
    // ignore
  }
}
const addPendingEvent = (id: string) => {
  const ids = readPendingEvents()
  writePendingEvents([...ids, id])
}
const refreshPendingTTL = (id: string) => {
  const ids = readPendingEvents()
  if (!ids.includes(id)) {
    // Do not re-add if it's no longer pending
    return
  }
  // Rewrite the same ids list to bump TTL
  writePendingEvents(ids)
}
const removePendingEventStorageOnly = (id: string) => {
  const ids = readPendingEvents().filter((v) => v !== id)
  writePendingEvents(ids)
}

/** Read/write latest progress payload per event (for follower tabs to mirror UI) */
const writeProgressToStorage = (eventId: string, payload: EventProgressPayload) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(progressStorageKey(eventId), JSON.stringify(payload))
  } catch {
    // ignore
  }
}
const readProgressFromStorage = (eventId: string): EventProgressPayload | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(progressStorageKey(eventId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EventProgressPayload>
    if (typeof parsed?.title === 'string' && typeof parsed?.message === 'string') {
      return parsed as EventProgressPayload
    }
    return null
  } catch {
    return null
  }
}

/**
 * Event Progress Store
 * - Single-leader cross-tab long-polling for each event
 * - Followers mirror UI via localStorage 'storage' events
 * - Pending events with TTL to resume on load
 */
export const useEventProgressStore = defineStore('event-progress', () => {
  const authStore = useAuthStore()
  const { createProgressNotification } = useProgressNotifications()
  const notificationStore = useNotificationStore()

  // One active polling loop per event per tab
  const activePolls = new Set<string>()
  // Notification handles per event
  const handles = new Map<string, ProgressNotificationHandle>()
  // Which owner token currently leads in this tab (bookkeeping)
  const leaderOwners = new Map<string, string>()
  // Retry timers to periodically try acquiring leadership
  const leaderRetryTimers = new Map<string, number>()
  // Abort controllers per event for in-flight polls (leader)
  const abortControllers = new Map<string, AbortController>()
  // Events this tab was demoted from leadership for (to avoid cleanup on abort)
  const demotedLeaders = new Set<string>()

  const isLoggedIn = computed(() => authStore.isLoggedIn)

  // In-store removal that also clears timers and snapshots
  const removePending = (id: string) => {
    // Update storage first
    removePendingEventStorageOnly(id)
    // stop leader retry timer for this event
    const timer = leaderRetryTimers.get(id)
    if (typeof window !== 'undefined' && typeof timer === 'number') {
      window.clearInterval(timer)
    }
    leaderRetryTimers.delete(id)
    // remove stored progress snapshot
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(progressStorageKey(id))
      }
    } catch {
      // ignore
    }
    console.debug('[event-progress] Removed pending event', { eventId: id })
  }

  /** Get (or create) a progress notification handle for an event */
  const getOrCreateHandle = (eventId: string): ProgressNotificationHandle => {
    const existing = handles.get(eventId)
    if (existing) return existing
    const h = createProgressNotification({
      icon: 'hourglass_top',
      title: 'GitHub validation queued…',
      message: 'We’ll watch the workflow and notify you of any updates.',
      progress: 'indeterminate',
    })
    handles.set(eventId, h)
    return h
  }

  /** Apply a progress payload to the local notification and optionally broadcast to other tabs */
  const applyEventToProgress = (eventId: string, payload: EventProgressPayload, broadcast: boolean = true) => {
    const handle = getOrCreateHandle(eventId)
    handle.update({
      icon: payload.icon || '',
      title: payload.title,
      message: payload.message,
      progress: payload.progress,
    })
    if (broadcast) {
      writeProgressToStorage(eventId, payload)
    }
  }

  /** Long-polling loop for a single event, leader-only */
  const pollEventProgress = async (eventId: string, owner: string, dvToken: string): Promise<void> => {
    let lastRevision: string | null = null
    let done = false
    const handle = getOrCreateHandle(eventId)

    while (!done) {
      // If we lost leadership, demote and switch to follower mode
      const rec = getLeaderRecord(eventId)
      if (!rec || rec.owner !== owner) {
        console.debug('[event-progress] Lost leadership, demoting', { eventId })
        activePolls.delete(eventId)
        leaderOwners.delete(eventId)
        void ensureMonitoring(eventId)
        return
      }

      let controller: AbortController | null = null
      try {
        // Keep the leader lock alive
        renewLeaderLock(eventId, owner)

        const url = `/deck-verified/api/events/${encodeURIComponent(eventId)}/progress` + (lastRevision ? `?last=${encodeURIComponent(lastRevision)}` : '')
        controller = new AbortController()
        abortControllers.set(eventId, controller)
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${dvToken}` },
          signal: controller.signal,
        })
        abortControllers.delete(eventId)

        if (response.status === 204) {
          console.debug('[event-progress] 204 heartbeat', { eventId })
          // heartbeat/no change; renew TTLs (only if still pending)
          refreshPendingTTL(eventId)
          continue
        }

        if (response.status === 404) {
          console.debug('[event-progress] 404 not found; finishing', { eventId })
          // Event no longer exists; finish quietly and cleanup for generic extensibility
          removePending(eventId)
          const cur = getLeaderRecord(eventId)
          if (cur && cur.owner === owner) {
            releaseLeaderLock(eventId, owner)
          }
          handle.finish(0)
          try {
            notificationStore.refresh?.()
          } catch {
            // ignore
          }
          return
        }

        if (!response.ok) {
          throw new Error(`event_progress_failed_${response.status}`)
        }

        const payload = await response.json() as EventProgressPayload
        console.debug('[event-progress] Progress payload received', {
          eventId,
          status: payload.status,
          done: payload.done,
        })
        applyEventToProgress(eventId, payload, true)
        renewLeaderLock(eventId, owner)
        lastRevision = payload.revision
        done = Boolean(payload.done)
      } catch {
        abortControllers.delete(eventId)
        const wasAborted = (controller?.signal?.aborted === true) || demotedLeaders.has(eventId)
        if (wasAborted) {
          // Demoted: do not clean up pending or release locks; follower will continue
          console.debug('[event-progress] Aborted due to demotion; switching to follower', { eventId })
          demotedLeaders.delete(eventId)
          activePolls.delete(eventId)
          leaderOwners.delete(eventId)
          void ensureMonitoring(eventId)
          return
        }
        // Interruption: finalize; followers may resume later
        removePending(eventId)
        const cur = getLeaderRecord(eventId)
        if (cur && cur.owner === owner) {
          releaseLeaderLock(eventId, owner)
        }
        handle.update({
          icon: 'error',
          title: 'Validation monitor interrupted',
          message: 'We lost connection to the monitor. Check GitHub for final status.',
          progress: 100,
        })
        handle.finish(0)
        return
      }
    }

    // Completed successfully
    removePending(eventId)
    const rec2 = getLeaderRecord(eventId)
    if (rec2 && rec2.owner === owner) {
      releaseLeaderLock(eventId, owner)
    }
    handle.finish(2000)
    try {
      notificationStore.refresh?.()
    } catch {
      // ignore
    }
  }

  /** Schedule periodic attempts to become leader for an event (follower mode) */
  const scheduleLeaderRetry = (eventId: string, fn: () => Promise<void>) => {
    if (typeof window === 'undefined') return
    if (leaderRetryTimers.has(eventId)) return
    const timerId = window.setInterval(async () => {
      if (activePolls.has(eventId)) return
      await fn()
    }, LEADER_RETRY_INTERVAL_MS)
    leaderRetryTimers.set(eventId, timerId)
  }

  /** Attempt to become leader and start polling; otherwise mirror as follower */
  const ensureMonitoring = async (eventId: string): Promise<void> => {
    // Skip if event is no longer pending
    if (!readPendingEvents().includes(eventId)) {
      console.debug('[event-progress] ensureMonitoring skipped; not pending', { eventId })
      return
    }
    if (activePolls.has(eventId)) return

    // Try to acquire the leader lock for this event
    const tryBecomeLeader = async (): Promise<boolean> => {
      const owner = generateLeaderOwner()
      // small random jitter to reduce simultaneous lock writes across tabs
      const jitter = Math.floor(Math.random() * 150) + 50
      await delay(jitter)
      const acquired = acquireLeaderLock(eventId, owner)
      if (!acquired) {
        console.debug('[event-progress] Leadership acquisition failed; will follow', { eventId, jitter })
        return false
      }
      // post-acquire stabilization: ensure we still own the lock after a brief delay
      await delay(60)
      const recAfter = getLeaderRecord(eventId)
      if (!recAfter || recAfter.owner !== owner) {
        console.debug('[event-progress] Leadership lost during stabilization; will follow', { eventId })
        return false
      }
      console.debug('[event-progress] Leadership acquired', { eventId, owner })

      // Ensure DV token; quick retries
      let dvToken: string | null = null
      for (let attempt = 0; attempt < 3 && !dvToken; attempt += 1) {
        dvToken = await authStore.ensureInternalToken()
        if (!dvToken) await delay(500)
      }
      if (!dvToken) {
        releaseLeaderLock(eventId, owner)
        return false
      }

      activePolls.add(eventId)
      leaderOwners.set(eventId, owner)
      refreshPendingTTL(eventId)

      try {
        // Reconfirm ownership prior to starting poll to avoid flapping
        const recBeforePoll = getLeaderRecord(eventId)
        if (!recBeforePoll || recBeforePoll.owner !== owner) {
          console.debug('[event-progress] Leadership lost before polling; abort', { eventId })
          return false
        }
        await pollEventProgress(eventId, owner, dvToken)
      } finally {
        activePolls.delete(eventId)
        leaderOwners.delete(eventId)
        const rec = getLeaderRecord(eventId)
        if (rec && rec.owner === owner) {
          releaseLeaderLock(eventId, owner)
        }
      }
      return true
    }

    // If not leader, mirror follower view and schedule periodic try
    if (!(await tryBecomeLeader())) {
      const payload = readProgressFromStorage(eventId)
      if (payload) {
        console.debug('[event-progress] Follower mirroring from storage', { eventId })
        applyEventToProgress(eventId, payload, false)
        if (payload.done) {
          console.debug('[event-progress] Follower observed done; finishing', { eventId })
          removePending(eventId)
          const handle = getOrCreateHandle(eventId)
          handle.finish(2000)
          try {
            notificationStore.refresh?.()
          } catch {
            // ignore
          }
          return
        }
      }
      console.debug('[event-progress] Scheduling leader retry (follower mode)', { eventId })
      scheduleLeaderRetry(eventId, async () => {
        if (activePolls.has(eventId)) return
        const ok = await tryBecomeLeader()
        if (ok && typeof window !== 'undefined') {
          const timer = leaderRetryTimers.get(eventId)
          if (timer) {
            window.clearInterval(timer)
            leaderRetryTimers.delete(eventId)
          }
        }
      })
    }
  }

  /** Resume monitoring for all pending events from localStorage (on app load) */
  const resumePendingFromStorage = async (): Promise<void> => {
    if (!isLoggedIn.value) return
    const ids = readPendingEvents()
    for (const id of ids) {
      // Mirror latest progress immediately (if any)
      const payload = readProgressFromStorage(id)
      if (payload) {
        applyEventToProgress(id, payload, false)
      }
      // Attempt to become leader or stay as a follower
      void ensureMonitoring(id)
    }
  }

  /** Cross-tab storage listener to mirror progress and react to pending events changes */
  let storageListenerAttached = false
  const attachStorageListenerOnce = () => {
    if (typeof window === 'undefined' || storageListenerAttached) return
    storageListenerAttached = true
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key) return

      // Pending events changed: try to ensure monitoring locally
      if (e.key === PENDING_EVENTS_KEY) {
        const ids = readPendingEvents()
        console.debug('[event-progress] Storage pending events changed', { ids })
        for (const id of ids) {
          if (!activePolls.has(id)) {
            void ensureMonitoring(id)
          }
        }
        return
      }

      // Leader lock changed: if we were the leader and lost ownership, abort in-flight poll and demote
      if (e.key.startsWith(LEADER_LOCK_KEY_PREFIX)) {
        const eventId = e.key.slice(LEADER_LOCK_KEY_PREFIX.length)
        const currentOwner = leaderOwners.get(eventId)
        try {
          const rec = e.newValue ? (JSON.parse(e.newValue) as { owner?: string }) : null
          if (currentOwner && (!rec || rec.owner !== currentOwner)) {
            demotedLeaders.add(eventId)
            const ctrl = abortControllers.get(eventId)
            if (ctrl) ctrl.abort()
          }
        } catch {
          // ignore parse errors
        }
      }

      // Progress for a specific event changed: mirror follower UI
      if (e.key.startsWith(PROGRESS_STORAGE_PREFIX)) {
        const eventId = e.key.slice(PROGRESS_STORAGE_PREFIX.length)
        if (!eventId) return
        try {
          if (!e.newValue) return
          const payload = JSON.parse(e.newValue) as EventProgressPayload
          console.debug('[event-progress] Mirroring progress from storage event', {
            eventId,
            status: payload.status,
            done: payload.done,
          })
          applyEventToProgress(eventId, payload, false)
          if (payload.done) {
            console.debug('[event-progress] Storage observed done; finishing', { eventId })
            removePending(eventId)
            const handle = getOrCreateHandle(eventId)
            handle.finish(2000)
            try {
              notificationStore.refresh?.()
            } catch {
              // ignore
            }
            return
          }
        } catch {
          // ignore parse errors
        }
      }
    })
  }

  // Initialize on store creation
  attachStorageListenerOnce()
  void resumePendingFromStorage()

  return {
    // Public API
    ensureMonitoring,
    resumePendingFromStorage,
    addPendingEvent,     // optional external usage if desired
    removePending,       // optional external usage if desired
  }
})

