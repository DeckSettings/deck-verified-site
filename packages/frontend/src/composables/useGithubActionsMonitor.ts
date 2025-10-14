import { apiUrl, fetchService } from 'src/utils/api'
import { computed } from 'vue'
import { useAuthStore } from 'stores/auth-store'
import { useTaskProgressStore } from 'src/stores/task-progress-store'
import { useQuasar } from 'quasar'

interface MonitorOptions {
  issueNumber: number
  issueUrl: string
  createdAt: string
  repository?: {
    owner: string
    name: string
  }
  workflowType?: 'validation' | 'operations' | string
  operation?: string | null
}

const createTaskId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `task_${Math.random().toString(36).slice(2)}`
}

/**
 * Starts a GitHub Actions monitor task on the backend, then delegates
 * progress tracking and cross-tab coordination to the task-progress store.
 */
export const useGithubActionsMonitor = () => {
  const $q = useQuasar()
  const authStore = useAuthStore()
  const taskStore = useTaskProgressStore()

  const accessToken = computed(() => authStore.accessToken)

  const monitorIssue = async (options: MonitorOptions): Promise<void> => {
    const token = accessToken.value
    const dvToken = await authStore.ensureInternalToken()
    if (!token || !dvToken) {
      $q.notify({ type: 'negative', message: 'Sign in again to monitor report validation.' })
      return
    }

    // Ensure options.workflowType defaults to 'validation'
    const taskId = createTaskId()
    const effectiveOptions = {
      ...options,
      workflowType: options.workflowType ?? 'validation',
      operation: options.operation ?? null,
    }

    try {
      const response = await fetchService(apiUrl('/deck-verified/api/tasks'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dvToken}`,
          'X-GitHub-Token': token,
        },
        body: JSON.stringify({
          taskId,
          taskType: 'github:actions:monitor',
          payload: effectiveOptions,
        }),
      })

      if (!response.ok) {
        throw new Error(`monitor_start_failed_${response.status}`)
      }

      // Persist and begin monitoring (store handles single-leader polling + cross-tab sync)
      taskStore.addPendingTask(taskId)
      void taskStore.ensureMonitoring(taskId)
    } catch (error) {
      console.error('Failed to start GitHub actions monitor', error)
      $q.notify({ type: 'negative', message: 'Unable to start GitHub validation monitor.' })
    }
  }

  return {
    monitorIssue,
    resumePendingFromStorage: taskStore.resumePendingFromStorage,
  }
}