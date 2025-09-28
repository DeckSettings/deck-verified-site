import { computed } from 'vue'
import { useAuthStore } from 'stores/auth-store'
import { useEventProgressStore } from 'src/stores/event-progress-store'
import { useQuasar } from 'quasar'

interface MonitorOptions {
  issueNumber: number
  issueUrl: string
  createdAt: string
  repository?: {
    owner: string
    name: string
  }
}

const createEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `evt_${Math.random().toString(36).slice(2)}`
}

/**
 * Starts a GitHub Actions monitor task on the backend, then delegates
 * progress tracking and cross-tab coordination to the event-progress store.
 */
export const useGithubActionsMonitor = () => {
  const $q = useQuasar()
  const authStore = useAuthStore()
  const eventStore = useEventProgressStore()

  const accessToken = computed(() => authStore.accessToken)

  const monitorIssue = async (options: MonitorOptions): Promise<void> => {
    const token = accessToken.value
    const dvToken = await authStore.ensureInternalToken()
    if (!token || !dvToken) {
      $q.notify({ type: 'negative', message: 'Sign in again to monitor report validation.' })
      return
    }

    const eventId = createEventId()

    try {
      const response = await fetch('/deck-verified/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dvToken}`,
          'X-GitHub-Token': token,
        },
        body: JSON.stringify({
          eventId,
          taskType: 'github:actions:monitor',
          payload: options,
        }),
      })

      if (!response.ok) {
        throw new Error(`monitor_start_failed_${response.status}`)
      }

      // Persist and begin monitoring (store handles single-leader polling + cross-tab sync)
      eventStore.addPendingEvent(eventId)
      void eventStore.ensureMonitoring(eventId)
    } catch (error) {
      console.error('Failed to start GitHub actions monitor', error)
      $q.notify({ type: 'negative', message: 'Unable to start GitHub validation monitor.' })
    }
  }

  return {
    monitorIssue,
    resumePendingFromStorage: eventStore.resumePendingFromStorage,
  }
}