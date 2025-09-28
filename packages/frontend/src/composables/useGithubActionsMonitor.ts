import { computed } from 'vue'
import { useAuthStore } from 'stores/auth-store'
import { fetchLabels } from 'src/services/gh-reports'
import { useNotifications } from 'src/composables/useNotifications'
import { useProgressNotifications } from 'src/composables/useProgressNotifications'
import { useQuasar } from 'quasar'

interface GithubWorkflowRun {
  id: number
  status: string
  conclusion: string | null
  event: string
  name?: string
  created_at: string
}

interface GithubWorkflowRunsResponse {
  workflow_runs: GithubWorkflowRun[]
}

interface GithubIssueLabel {
  name?: string
}

interface GithubIssueResponse {
  labels?: GithubIssueLabel[]
}

interface MonitorOptions {
  issueNumber: number
  issueUrl: string
  createdAt: string
  repository?: {
    owner: string
    name: string
  }
}

const DEFAULT_REPO = {
  owner: 'DeckSettings',
  name: 'game-reports-steamos',
}

const POLL_INTERVAL_MS = 5000
const MAX_RUN_SEARCH_ATTEMPTS = 6
const MAX_RUN_STATUS_ATTEMPTS = 24

const delay = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const buildHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
})

const buildApiUrl = (owner: string, repo: string, path: string) => `https://api.github.com/repos/${owner}/${repo}${path}`

/**
 * Provides helpers for monitoring GitHub Actions triggered by a freshly created issue.
 */
export const useGithubActionsMonitor = () => {
  const $q = useQuasar()
  const authStore = useAuthStore()
  const { createProgressNotification } = useProgressNotifications()
  const { pushNotification } = useNotifications()

  const accessToken = computed(() => authStore.accessToken)

  const monitorIssue = async (options: MonitorOptions): Promise<void> => {
    const token = accessToken.value
    if (!token) return

    const repo = options.repository ?? DEFAULT_REPO
    const progress = createProgressNotification({
      icon: 'hourglass_top',
      title: 'Waiting for GitHub Actions to start…',
      description: 'Monitoring automated validation for your report.',
      progress: 'indeterminate',
    })

    try {
      await delay(10_000)

      const run = await waitForWorkflowRun({
        token,
        repo,
        issueCreatedAt: options.createdAt,
        issueNumber: options.issueNumber,
      })

      if (!run) {
        progress.finish(2000)
        return
      }

      progress.update({
        title: 'GitHub Actions running…',
        description: run.name || 'Validation workflow in progress…',
        progress: 'indeterminate',
      })

      await waitForRunCompletion({ token, repo, runId: run.id })

      progress.update({
        title: 'Fetching validation results…',
        description: 'Checking issue labels for validation feedback.',
        progress: 'indeterminate',
      })

      const issue = await fetchIssue({ token, repo, issueNumber: options.issueNumber })
      if (issue) {
        const invalidFound = await processInvalidLabels(issue, options.issueUrl)
        await processNoteLabels(issue, options.issueUrl)
        if (!invalidFound) {
          pushNotification({
            icon: 'check_circle',
            title: 'Report Submitted',
            body: 'Your report was submitted successfully and should appear soon.',
            link: options.issueUrl,
            variant: 'positive',
            linkTooltip: 'Open report on GitHub',
          })
          $q.notify({
            type: 'positive',
            message: 'Report Validation complete — your report passed and will be live shortly.',
          })
        }
      } else {
        pushNotification({
          icon: 'check_circle',
          title: 'Report Submitted',
          body: 'Your report was submitted successfully and should appear soon.',
          link: options.issueUrl,
          variant: 'positive',
          linkTooltip: 'Open report on GitHub',
        })
        $q.notify({
          type: 'positive',
          message: 'Report Validation complete — your report passed and will be live shortly.',
        })
      }

      progress.finish(2000)
    } catch (error) {
      console.error('GitHub actions monitor failed', error)
      progress.finish(2000)
    }
  }

  const parseLogfmt = (input: string): Record<string, string> => {
    const result: Record<string, string> = {}
    const regex = /(\w+)="([^"]*)"/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(input)) !== null) {
      const key = match[1] ?? ''
      const value = match[2] ?? ''
      if (key) {
        result[key] = value
      }
    }

    return result
  }

  const waitForWorkflowRun = async ({ token, repo, issueCreatedAt, issueNumber }: {
    token: string
    repo: { owner: string; name: string }
    issueCreatedAt: string
    issueNumber: number
  }): Promise<GithubWorkflowRun | null> => {
    const issueCreatedMs = Date.parse(issueCreatedAt)
    for (let attempt = 0; attempt < MAX_RUN_SEARCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(
          `${buildApiUrl(repo.owner, repo.name, '/actions/runs')}?event=issues&per_page=20`,
          { headers: buildHeaders(token) },
        )
        if (!response.ok) throw new Error(`Failed to fetch workflow runs (${response.status})`)
        const payload = await response.json() as GithubWorkflowRunsResponse
        const run = payload.workflow_runs.find((candidate) => {
          if (!candidate || candidate.event !== 'issues' || Date.parse(candidate.created_at) < issueCreatedMs - 2000) {
            return false
          }
          if (typeof candidate.name !== 'string') return false
          const parsed = parseLogfmt(candidate.name)
          return Number(parsed.trigger_issue_number) === issueNumber
        })
        if (run) return run
      } catch (error) {
        console.warn('Unable to locate workflow run yet', error)
      }
      await delay(POLL_INTERVAL_MS)
    }
    return null
  }

  const waitForRunCompletion = async ({ token, repo, runId }: {
    token: string
    repo: { owner: string; name: string }
    runId: number
  }): Promise<void> => {
    for (let attempt = 0; attempt < MAX_RUN_STATUS_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(
          buildApiUrl(repo.owner, repo.name, `/actions/runs/${runId}`),
          { headers: buildHeaders(token) },
        )
        if (!response.ok) throw new Error(`Failed to fetch workflow run (${response.status})`)
        const run = await response.json() as GithubWorkflowRun
        if (run.status === 'completed') return
      } catch (error) {
        console.warn('Unable to fetch workflow status', error)
      }
      await delay(POLL_INTERVAL_MS)
    }
  }

  const fetchIssue = async ({ token, repo, issueNumber }: {
    token: string
    repo: { owner: string; name: string }
    issueNumber: number
  }): Promise<GithubIssueResponse | null> => {
    try {
      const response = await fetch(
        buildApiUrl(repo.owner, repo.name, `/issues/${issueNumber}`),
        { headers: buildHeaders(token) },
      )
      if (!response.ok) throw new Error(`Failed to fetch issue (${response.status})`)
      return await response.json() as GithubIssueResponse
    } catch (error) {
      console.error('Failed to fetch issue details', error)
      return null
    }
  }

  const processInvalidLabels = async (issue: GithubIssueResponse, issueUrl: string) => {
    const labels = issue.labels || []
    const invalidNames = labels
      .map((label) => label?.name)
      .filter((name): name is string => typeof name === 'string' && name.startsWith('invalid:'))

    if (!invalidNames.length) return false

    let labelDescriptions: Record<string, string> = {}
    try {
      const allLabels = await fetchLabels()
      labelDescriptions = allLabels.reduce<Record<string, string>>((acc, label) => {
        if (label.name && label.description) {
          acc[label.name] = label.description
        }
        return acc
      }, {})
    } catch (error) {
      console.error('Failed to resolve label descriptions', error)
    }

    invalidNames.forEach((name) => {
      const description = labelDescriptions[name]
      if (!description) return
      pushNotification({
        icon: 'warning',
        title: 'Report Validation Failed',
        body: description,
        link: issueUrl,
        variant: 'warning',
        linkTooltip: 'Open report on GitHub',
      })
      $q.notify({ type: 'warning', message: `Report Validation Failed: ${description}` })
    })

    return true
  }

  const processNoteLabels = async (issue: GithubIssueResponse, issueUrl: string) => {
    const labels = issue.labels || []
    const noteNames = labels
      .map((label) => label?.name)
      .filter((name): name is string => typeof name === 'string' && name.startsWith('note:'))

    if (!noteNames.length) return false

    let labelDescriptions: Record<string, string> = {}
    try {
      const allLabels = await fetchLabels()
      labelDescriptions = allLabels.reduce<Record<string, string>>((acc, label) => {
        if (label.name && label.description) {
          acc[label.name] = label.description
        }
        return acc
      }, {})
    } catch (error) {
      console.error('Failed to resolve note label descriptions', error)
    }

    noteNames.forEach((name) => {
      const description = labelDescriptions[name]
      pushNotification({
        icon: 'info',
        title: 'Report Update',
        body: description || 'Your report includes additional notes from validation.',
        link: issueUrl,
        variant: 'info',
        linkTooltip: 'Open report on GitHub',
      })
    })

    return true
  }

  return {
    monitorIssue,
  }
}
