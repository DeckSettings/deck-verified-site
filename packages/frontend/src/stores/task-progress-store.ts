import { apiUrl } from 'src/utils/api';
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from 'stores/auth-store'
import { useProgressNotifications } from 'src/composables/useProgressNotifications'
import type { ProgressNotificationHandle } from 'src/composables/useProgressNotifications'
import { useNotificationStore } from 'stores/notification-store'

export interface TaskProgressPayload {
  taskId: string;
  status: string;
  icon: string | null;
  title: string;
  message: string;
  progress: number | 'indeterminate' | null;
  done: boolean;
  variant?: string;
  updatedAt: number;
  revision: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const PENDING_TASKS_KEY = 'dv_pending_tasks'
const PENDING_TASKS_TTL_MS = 10 * 60 * 1000

const PROGRESS_STORAGE_PREFIX = 'dv_task_progress:'

const LEADER_LOCK_KEY_PREFIX = 'dv_task_leader:'
const LEADER_LOCK_TTL_MS = 30_000
const LEADER_RETRY_INTERVAL_MS = 1_500

const leaderLockKey = (taskId: string) => `${LEADER_LOCK_KEY_PREFIX}${taskId}`
const progressStorageKey = (taskId: string) => `${PROGRESS_STORAGE_PREFIX}${taskId}`

const generateLeaderOwner = () => `task_leader_${Math.random().toString(36).slice(2)}`

const getLeaderRecord = (taskId: string): { owner: string; until: number } | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(leaderLockKey(taskId))
    if (!raw) return null
    const obj = JSON.parse(raw) as { owner?: unknown; until?: unknown }
    if (typeof obj?.owner === 'string' && typeof obj?.until === 'number') {
      return { owner: obj.owner, until: obj.until }
    }
    window.localStorage.removeItem(leaderLockKey(taskId))
    return null
  } catch {
    window.localStorage.removeItem(leaderLockKey(taskId))
    return null
  }
}

const setLeaderRecord = (taskId: string, owner: string, until: number) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(leaderLockKey(taskId), JSON.stringify({ owner, until }))
  } catch {
    // ignore
  }
}

const acquireLeaderLock = (taskId: string, owner: string): boolean => {
  if (typeof window === 'undefined') return true
  const now = Date.now()
  const existing = getLeaderRecord(taskId)
  if (existing && existing.owner !== owner && existing.until > now) {
    return false
  }
  setLeaderRecord(taskId, owner, now + LEADER_LOCK_TTL_MS)
  const confirm = getLeaderRecord(taskId)
  return !!confirm && confirm.owner === owner
}

const renewLeaderLock = (taskId: string, owner: string): void => {
  if (typeof window === 'undefined') return
  const now = Date.now()
  const rec = getLeaderRecord(taskId)
  if (rec && rec.owner === owner) {
    setLeaderRecord(taskId, owner, now + LEADER_LOCK_TTL_MS)
  }
}

const releaseLeaderLock = (taskId: string, owner: string): void => {
  if (typeof window === 'undefined') return
  try {
    const cur = getLeaderRecord(taskId)
    if (cur && cur.owner !== owner) return
    window.localStorage.removeItem(leaderLockKey(taskId))
  } catch {
    window.localStorage.removeItem(leaderLockKey(taskId))
  }
}

const readPendingTasks = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PENDING_TASKS_KEY)
    if (!raw) return []
    const now = Date.now()
    const arr = JSON.parse(raw)
    let entries: { id: string; expiresAt: number }[] = []
    if (Array.isArray(arr)) {
      const maybeEntries = (arr as unknown[]).filter((e): e is { id: string; expiresAt: number } => {
        return !!e && typeof e === 'object' && typeof (e as { id: unknown }).id === 'string' && typeof (e as {
          expiresAt: unknown
        }).expiresAt === 'number'
      })
      entries = maybeEntries.map((e) => ({ id: e.id, expiresAt: e.expiresAt }))
    }
    const valid = entries.filter((e) => typeof e.id === 'string' && e.id.length > 0 && e.expiresAt > now)
    try {
      if (valid.length > 0) {
        window.localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(valid))
      } else {
        window.localStorage.removeItem(PENDING_TASKS_KEY)
      }
    } catch {
      // ignore persistence failure
    }
    return valid.map((e) => e.id)
  } catch {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(PENDING_TASKS_KEY)
    } catch {
      // ignore
    }
    return []
  }
}

const writePendingTasks = (ids: string[]) => {
  if (typeof window === 'undefined') return
  try {
    const now = Date.now()
    const unique = Array.from(new Set(ids.filter((v) => typeof v === 'string' && v.length > 0)))
    const entries = unique.map((id) => ({ id, expiresAt: now + PENDING_TASKS_TTL_MS }))
    window.localStorage.setItem(PENDING_TASKS_KEY, JSON.stringify(entries))
  } catch {
    // ignore
  }
}

const addPendingTask = (id: string) => {
  const ids = readPendingTasks()
  writePendingTasks([...ids, id])
}

const refreshPendingTTL = (id: string) => {
  const ids = readPendingTasks()
  if (!ids.includes(id)) {
    return
  }
  writePendingTasks(ids)
}

const removePendingTaskStorageOnly = (id: string) => {
  const ids = readPendingTasks().filter((v) => v !== id)
  writePendingTasks(ids)
}

const writeProgressToStorage = (taskId: string, payload: TaskProgressPayload) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(progressStorageKey(taskId), JSON.stringify(payload))
  } catch {
    // ignore
  }
}

const readProgressFromStorage = (taskId: string): TaskProgressPayload | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(progressStorageKey(taskId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TaskProgressPayload>
    if (typeof parsed?.title === 'string' && typeof parsed?.message === 'string') {
      return parsed as TaskProgressPayload
    }
    return null
  } catch {
    return null
  }
}

export const useTaskProgressStore = defineStore('task-progress', () => {
  const authStore = useAuthStore()
  const { createProgressNotification } = useProgressNotifications()
  const notificationStore = useNotificationStore()

  const activePolls = new Set<string>()
  const handles = new Map<string, ProgressNotificationHandle>()
  const leaderOwners = new Map<string, string>()
  const leaderRetryTimers = new Map<string, number>()
  const abortControllers = new Map<string, AbortController>()
  const demotedLeaders = new Set<string>()

  const isLoggedIn = computed(() => authStore.isLoggedIn)

  const removePending = (id: string) => {
    removePendingTaskStorageOnly(id)
    const timer = leaderRetryTimers.get(id)
    if (typeof window !== 'undefined' && typeof timer === 'number') {
      window.clearInterval(timer)
    }
    leaderRetryTimers.delete(id)
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(progressStorageKey(id))
      }
    } catch {
      // ignore
    }
    console.debug('[task-progress] Removed pending task', { taskId: id })
  }

  const getOrCreateHandle = (taskId: string): ProgressNotificationHandle => {
    const existing = handles.get(taskId)
    if (existing) return existing
    const h = createProgressNotification({
      icon: 'hourglass_top',
      title: 'GitHub validation queued…',
      message: 'We’ll watch the workflow and notify you of any updates.',
      progress: 'indeterminate',
    })
    handles.set(taskId, h)
    return h
  }

  const applyTaskToProgress = (taskId: string, payload: TaskProgressPayload, broadcast: boolean = true) => {
    const handle = getOrCreateHandle(taskId)
    handle.update({
      icon: payload.icon || '',
      title: payload.title,
      message: payload.message,
      progress: payload.progress,
    })
    if (broadcast) {
      writeProgressToStorage(taskId, payload)
    }
  }

  const pollTaskProgress = async (taskId: string, owner: string, dvToken: string): Promise<void> => {
    let lastRevision: string | null = null
    let done = false
    const handle = getOrCreateHandle(taskId)

    while (!done) {
      const rec = getLeaderRecord(taskId)
      if (!rec || rec.owner !== owner) {
        console.debug('[task-progress] Lost leadership, demoting', { taskId })
        activePolls.delete(taskId)
        leaderOwners.delete(taskId)
        void ensureMonitoring(taskId)
        return
      }

      let controller: AbortController | null = null
      try {
        renewLeaderLock(taskId, owner)

        const url = apiUrl(`/deck-verified/api/tasks/${encodeURIComponent(taskId)}/progress`) + (lastRevision ? `?last=${encodeURIComponent(lastRevision)}` : '')
        controller = new AbortController()
        abortControllers.set(taskId, controller)
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${dvToken}` },
          signal: controller.signal,
        })
        abortControllers.delete(taskId)

        if (response.status === 204) {
          console.debug('[task-progress] 204 heartbeat', { taskId })
          refreshPendingTTL(taskId)
          continue
        }

        if (response.status === 404) {
          console.debug('[task-progress] 404 not found; finishing', { taskId })
          removePending(taskId)
          const cur = getLeaderRecord(taskId)
          if (cur && cur.owner === owner) {
            releaseLeaderLock(taskId, owner)
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
          throw new Error(`task_progress_failed_${response.status}`)
        }

        const payload = await response.json() as TaskProgressPayload
        console.debug('[task-progress] Progress payload received', {
          taskId,
          status: payload.status,
          done: payload.done,
        })
        applyTaskToProgress(taskId, payload, true)
        renewLeaderLock(taskId, owner)
        lastRevision = payload.revision
        done = Boolean(payload.done)
      } catch {
        abortControllers.delete(taskId)
        const wasAborted = (controller?.signal?.aborted === true) || demotedLeaders.has(taskId)
        if (wasAborted) {
          console.debug('[task-progress] Aborted due to demotion; switching to follower', { taskId })
          demotedLeaders.delete(taskId)
          activePolls.delete(taskId)
          leaderOwners.delete(taskId)
          void ensureMonitoring(taskId)
          return
        }
        removePending(taskId)
        const cur = getLeaderRecord(taskId)
        if (cur && cur.owner === owner) {
          releaseLeaderLock(taskId, owner)
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

    removePending(taskId)
    const rec2 = getLeaderRecord(taskId)
    if (rec2 && rec2.owner === owner) {
      releaseLeaderLock(taskId, owner)
    }
    handle.finish(2000)
    try {
      notificationStore.refresh?.()
    } catch {
      // ignore
    }
  }

  const scheduleLeaderRetry = (taskId: string, fn: () => Promise<void>) => {
    if (typeof window === 'undefined') return
    if (leaderRetryTimers.has(taskId)) return
    const timerId = window.setInterval(async () => {
      if (activePolls.has(taskId)) return
      await fn()
    }, LEADER_RETRY_INTERVAL_MS)
    leaderRetryTimers.set(taskId, timerId)
  }

  const ensureMonitoring = async (taskId: string): Promise<void> => {
    if (!readPendingTasks().includes(taskId)) {
      console.debug('[task-progress] ensureMonitoring skipped; not pending', { taskId })
      return
    }
    if (activePolls.has(taskId)) return

    const tryBecomeLeader = async (): Promise<boolean> => {
      const owner = generateLeaderOwner()
      const jitter = Math.floor(Math.random() * 150) + 50
      await delay(jitter)
      const acquired = acquireLeaderLock(taskId, owner)
      if (!acquired) {
        console.debug('[task-progress] Leadership acquisition failed; will follow', { taskId, jitter })
        return false
      }
      await delay(60)
      const recAfter = getLeaderRecord(taskId)
      if (!recAfter || recAfter.owner !== owner) {
        console.debug('[task-progress] Leadership lost during stabilization; will follow', { taskId })
        return false
      }
      console.debug('[task-progress] Leadership acquired', { taskId, owner })

      let dvToken: string | null = null
      for (let attempt = 0; attempt < 3 && !dvToken; attempt += 1) {
        dvToken = await authStore.ensureInternalToken()
        if (!dvToken) await delay(500)
      }
      if (!dvToken) {
        releaseLeaderLock(taskId, owner)
        return false
      }

      activePolls.add(taskId)
      leaderOwners.set(taskId, owner)
      refreshPendingTTL(taskId)

      try {
        const recBeforePoll = getLeaderRecord(taskId)
        if (!recBeforePoll || recBeforePoll.owner !== owner) {
          console.debug('[task-progress] Leadership lost before polling; abort', { taskId })
          return false
        }
        await pollTaskProgress(taskId, owner, dvToken)
      } finally {
        activePolls.delete(taskId)
        leaderOwners.delete(taskId)
        const rec = getLeaderRecord(taskId)
        if (rec && rec.owner === owner) {
          releaseLeaderLock(taskId, owner)
        }
      }
      return true
    }

    if (!(await tryBecomeLeader())) {
      const payload = readProgressFromStorage(taskId)
      if (payload) {
        console.debug('[task-progress] Follower mirroring from storage', { taskId })
        applyTaskToProgress(taskId, payload, false)
        if (payload.done) {
          console.debug('[task-progress] Follower observed done; finishing', { taskId })
          removePending(taskId)
          const handle = getOrCreateHandle(taskId)
          handle.finish(2000)
          try {
            notificationStore.refresh?.()
          } catch {
            // ignore
          }
          return
        }
      }
      console.debug('[task-progress] Scheduling leader retry (follower mode)', { taskId })
      scheduleLeaderRetry(taskId, async () => {
        if (activePolls.has(taskId)) return
        const ok = await tryBecomeLeader()
        if (ok && typeof window !== 'undefined') {
          const timer = leaderRetryTimers.get(taskId)
          if (timer) {
            window.clearInterval(timer)
            leaderRetryTimers.delete(taskId)
          }
        }
      })
    }
  }

  const resumePendingFromStorage = async (): Promise<void> => {
    if (!isLoggedIn.value) return
    const ids = readPendingTasks()
    for (const id of ids) {
      const payload = readProgressFromStorage(id)
      if (payload) {
        applyTaskToProgress(id, payload, false)
      }
      void ensureMonitoring(id)
    }
  }

  let storageListenerAttached = false
  const attachStorageListenerOnce = () => {
    if (typeof window === 'undefined' || storageListenerAttached) return
    storageListenerAttached = true
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key) return

      if (e.key === PENDING_TASKS_KEY) {
        const ids = readPendingTasks()
        console.debug('[task-progress] Storage pending tasks changed', { ids })
        for (const id of ids) {
          if (!activePolls.has(id)) {
            void ensureMonitoring(id)
          }
        }
        return
      }

      if (e.key.startsWith(LEADER_LOCK_KEY_PREFIX)) {
        const taskId = e.key.slice(LEADER_LOCK_KEY_PREFIX.length)
        const currentOwner = leaderOwners.get(taskId)
        try {
          const rec = e.newValue ? (JSON.parse(e.newValue) as { owner?: string }) : null
          if (currentOwner && (!rec || rec.owner !== currentOwner)) {
            demotedLeaders.add(taskId)
            const ctrl = abortControllers.get(taskId)
            if (ctrl) ctrl.abort()
          }
        } catch {
          // ignore parse errors
        }
      }

      if (e.key.startsWith(PROGRESS_STORAGE_PREFIX)) {
        const taskId = e.key.slice(PROGRESS_STORAGE_PREFIX.length)
        if (!taskId) return
        try {
          if (!e.newValue) return
          const payload = JSON.parse(e.newValue) as TaskProgressPayload
          console.debug('[task-progress] Mirroring progress from storage event', {
            taskId,
            status: payload.status,
            done: payload.done,
          })
          applyTaskToProgress(taskId, payload, false)
          if (payload.done) {
            console.debug('[task-progress] Storage observed done; finishing', { taskId })
            removePending(taskId)
            const handle = getOrCreateHandle(taskId)
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

  attachStorageListenerOnce()
  void resumePendingFromStorage()

  return {
    ensureMonitoring,
    resumePendingFromStorage,
    addPendingTask,
    removePending,
  }
})
