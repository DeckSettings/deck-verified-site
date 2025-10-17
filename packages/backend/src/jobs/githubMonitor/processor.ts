import type { Job } from 'bullmq'
import logger from '../../logger'
import { appendNotification } from '../../notifications'
import { fetchHardwareInfo } from '../../external/decksettings/hw_info'
import { fetchRepoIssueLabels } from '../../external/decksettings/repo_issue_labels'
import { setTaskProgress } from '../../redis'
import { parseReportBody } from '../../helpers'
import type { GithubMonitorJobData } from './types'
import { fetchReportBodySchema } from '../../external/decksettings/report_body_schema'
import { fetchProjectsByAppIdOrGameName } from '../../external/decksettings/projects'

// --- Constants and Types --- //

const DEFAULT_REPO = {
  owner: 'DeckSettings',
  name: 'game-reports-steamos',
}

const INITIAL_DELAY_MS = 10_000
const POLL_INTERVAL_MS = 5_000
const MAX_RUN_SEARCH_ATTEMPTS = 6
const MAX_RUN_STATUS_ATTEMPTS = 24

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
  body?: string
  title?: string
}

type ProgressParams = {
  status: string
  icon: string | null
  title: string
  message: string
  progress: number | 'indeterminate' | null
  done: boolean
  variant?: string
}

// --- Helper Functions --- //

const delay = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const buildHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
})

const buildApiUrl = (owner: string, repo: string, path: string) => `https://api.github.com/repos/${owner}/${repo}${path}`

const sendNotification = async (userId: string, notification: {
  icon: string
  title: string
  body: string
  variant?: string
  link?: string
  linkTooltip?: string
}) => {
  try {
    await appendNotification(userId, notification)
  } catch (error) {
    logger.error('Failed to append monitor notification', error)
  }
}

const updateProgress = async (payload: GithubMonitorJobData, params: ProgressParams) => {
  await setTaskProgress(payload.userId, payload.taskId, {
    status: params.status,
    icon: params.icon,
    title: params.title,
    message: params.message,
    progress: params.progress,
    done: params.done,
    variant: params.variant,
  })
}

// --- Main Job Processor --- //

export async function run(job: Job<GithubMonitorJobData>): Promise<void> {
  const payload = job.data
  const repo = payload.repository ?? DEFAULT_REPO
  let appId: number | null = null
  let gameName: string | null = null

  const workflowType = payload.workflowType ?? 'validation'
  const operation = payload.operation ?? null
  const workflowLabel = workflowType === 'operations' ? 'operations' : 'validation'

  await updateProgress(payload, {
    status: 'queued',
    icon: 'hourglass_top',
    title: 'Waiting for GitHub Actions…',
    message: 'Monitoring GitHub actions for your report.',
    progress: 'indeterminate',
    done: false,
    variant: 'info',
  })

  try {
    await delay(INITIAL_DELAY_MS)

    const workflowRun = await waitForWorkflowRun({
      githubToken: payload.githubToken,
      repo,
      issueNumber: payload.issueNumber,
    })

    if (!workflowRun) {
      await updateProgress(payload, {
        status: 'warning',
        icon: 'schedule',
        title: `${workflowLabel.charAt(0).toUpperCase() + workflowLabel.slice(1)} pending`,
        message: `Unable to locate the ${workflowLabel} workflow run. Please check GitHub shortly.`,
        progress: 100,
        done: true,
        variant: 'warning',
      })
      await sendNotification(payload.userId, {
        icon: 'warning',
        title: `${workflowLabel.charAt(0).toUpperCase() + workflowLabel.slice(1)} Pending`,
        body: `Unable to locate the ${workflowLabel} workflow run. Please check back on GitHub shortly.`,
        variant: 'warning',
        link: payload.issueUrl,
        linkTooltip: 'Open report on GitHub',
      })
      return
    }

    await updateProgress(payload, {
      status: 'running',
      icon: 'play_arrow',
      title: 'GitHub Actions running…',
      message: workflowRun.name || 'GitHub workflow is in progress…',
      progress: 'indeterminate',
      done: false,
      variant: 'info',
    })

    await waitForRunCompletion({ githubToken: payload.githubToken, repo, runId: workflowRun.id })

    await updateProgress(payload, {
      status: 'running',
      icon: 'download',
      title: workflowType === 'validation' ? 'Fetching validation results…' : 'Fetching workflow results…',
      message: workflowType === 'validation' ? 'Checking issue labels for validation feedback.' : `Checking ${workflowLabel} workflow results.`,
      progress: 'indeterminate',
      done: false,
      variant: 'info',
    })

    const issue = await fetchIssue({
      githubToken: payload.githubToken,
      repo,
      issueNumber: payload.issueNumber,
    })

    if (issue && issue.body) {
      try {
        const reportBodySchema = await fetchReportBodySchema()
        const hardwareInfo = await fetchHardwareInfo()
        const parsedIssueData = await parseReportBody(issue.body, reportBodySchema, hardwareInfo)
        appId = parsedIssueData.app_id
        gameName = parsedIssueData.game_name
      } catch (error) {
        logger.error('Failed to parse issue body for game details', error)
      }
    }

    if (!issue) {
      // Check if the issue was deleted and we are monitoring for this
      if (workflowType === 'operations' && operation === 'delete') {
        await updateProgress(payload, {
          status: 'completed',
          icon: 'check_circle',
          title: 'Delete complete',
          message: 'Your report was permanently deleted via GitHub Actions.',
          progress: 100,
          done: true,
          variant: 'positive',
        })
        return
      }

      // Report an error fetching the issue details
      await updateProgress(payload, {
        status: 'warning',
        icon: 'help_outline',
        title: 'Validation status unknown',
        message: 'Could not fetch issue details. Please review the report on GitHub.',
        progress: 100,
        done: true,
        variant: 'warning',
      })
      await sendNotification(payload.userId, {
        icon: 'warning',
        title: 'Validation Status Unknown',
        body: 'Could not fetch issue details. Please review the report on GitHub.',
        variant: 'warning',
        link: payload.issueUrl,
        linkTooltip: 'Open report on GitHub',
      })
      return
    }

    if (workflowType === 'validation') {
      const invalidFound = await processInvalidLabels({
        userId: payload.userId,
        issue,
        issueUrl: payload.issueUrl,
        githubToken: payload.githubToken,
        onProgress: async (message, variant, done) => {
          await updateProgress(payload, {
            status: done ? 'warning' : 'running',
            icon: 'warning',
            title: done ? 'Validation issues detected' : 'Validation issue spotted',
            message,
            progress: done ? 100 : 'indeterminate',
            done: Boolean(done),
            variant: variant ?? 'warning',
          })
        },
      })

      await processNoteLabels({
        userId: payload.userId,
        issue,
        issueUrl: payload.issueUrl,
        githubToken: payload.githubToken,
        onProgress: async (message) => {
          await updateProgress(payload, {
            status: 'running',
            icon: 'info',
            title: 'Validation notes added',
            message,
            progress: 'indeterminate',
            done: false,
            variant: 'info',
          })
        },
      })

      if (!invalidFound) {
        await updateProgress(payload, {
          status: 'completed',
          icon: 'check_circle',
          title: 'Validation complete',
          message: 'Your report passed validation and should appear soon.',
          progress: 100,
          done: true,
          variant: 'positive',
        })
        await sendNotification(payload.userId, {
          icon: 'check_circle',
          title: 'Report Submitted',
          body: 'Your report passed validation and should appear soon.',
          variant: 'positive',
          link: payload.issueUrl,
          linkTooltip: 'Open report on GitHub',
        })

        // Force a refresh of the game data from GitHub
        if (appId || gameName) {
          try {
            logger.info(`Forcing cache refresh for game: appId=${appId}, gameName=${gameName}`)
            await fetchProjectsByAppIdOrGameName(appId ? String(appId) : null, gameName, payload.githubToken, true)
          } catch (error) {
            logger.error('Failed to force refresh game data after report submission', error)
          }
        }
      }
    } else if (workflowType === 'operations') {
      // Handle operations workflows. For now, support the 'delete' operation.
      if (operation === 'delete') {
        // If the issue was missing (handled earlier), we already returned success. Here the issue exists,
        // which means the delete workflow completed but the issue is still present.
        await updateProgress(payload, {
          status: 'warning',
          icon: 'error',
          title: 'Delete check complete',
          message: 'The delete workflow ran but the report still exists on GitHub. Please review the issue.',
          progress: 100,
          done: true,
          variant: 'warning',
        })
        await sendNotification(payload.userId, {
          icon: 'warning',
          title: 'Delete Check',
          body: 'The delete workflow ran but the report still exists on GitHub. Please review the issue.',
          variant: 'warning',
          link: payload.issueUrl,
          linkTooltip: 'Open report on GitHub',
        })
      }
    }
  } catch (error) {
    logger.error(`Job ${job.id} failed`, error)
    await updateProgress(payload, {
      status: 'failed',
      icon: 'error',
      title: 'Validation monitor failed',
      message: 'We were unable to monitor your report validation. Please check GitHub directly.',
      progress: 100,
      done: true,
      variant: 'negative',
    })
    await sendNotification(payload.userId, {
      icon: 'error',
      title: 'Validation Monitor Failed',
      body: 'We were unable to monitor your report validation. Please check GitHub directly.',
      variant: 'negative',
      link: payload.issueUrl,
      linkTooltip: 'Open report on GitHub',
    })
    // Re-throw the error to let BullMQ know the job has failed
    throw error
  }
}

// --- Polling and Processing Helpers --- //

const waitForWorkflowRun = async ({ githubToken, repo, issueNumber }: {
  githubToken: string
  repo: { owner: string; name: string }
  issueNumber: number
}): Promise<GithubWorkflowRun | null> => {
  for (let attempt = 0; attempt < MAX_RUN_SEARCH_ATTEMPTS; attempt += 1) {
    try {
      // Fetch recent workflow runs (no event filter) and match either 'issues' or 'issue_comment'
      const response = await fetch(
        `${buildApiUrl(repo.owner, repo.name, '/actions/runs')}?per_page=20`,
        { headers: buildHeaders(githubToken) },
      )
      if (!response.ok) throw new Error(`Failed to fetch workflow runs (${response.status})`)
      const responsePayload = await response.json() as GithubWorkflowRunsResponse
      const run = responsePayload.workflow_runs.find((candidate) => {
        if (!candidate) return false
        // Filter out runs not triggered by issue creation or issue comments
        if (candidate.event !== 'issues' && candidate.event !== 'issue_comment') return false
        // Filter runs which have the issue number in 'trigger_issue_number' in the run name
        if (typeof candidate.name !== 'string') return false
        const parsed = parseLogfmt(candidate.name)
        return Number(parsed.trigger_issue_number) === issueNumber
      })
      if (run) return run
    } catch (error) {
      logger.warn('Unable to locate workflow run yet', error)
    }
    await delay(POLL_INTERVAL_MS)
  }
  return null
}

const waitForRunCompletion = async ({ githubToken, repo, runId }: {
  githubToken: string
  repo: { owner: string; name: string }
  runId: number
}): Promise<void> => {
  for (let attempt = 0; attempt < MAX_RUN_STATUS_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(
        buildApiUrl(repo.owner, repo.name, `/actions/runs/${runId}`),
        { headers: buildHeaders(githubToken) },
      )
      if (!response.ok) throw new Error(`Failed to fetch workflow run (${response.status})`)
      const run = await response.json() as GithubWorkflowRun
      if (run.status === 'completed') return
    } catch (error) {
      logger.warn('Unable to fetch workflow status', error)
    }
    await delay(POLL_INTERVAL_MS)
  }
}

const fetchIssue = async ({ githubToken, repo, issueNumber }: {
  githubToken: string
  repo: { owner: string; name: string }
  issueNumber: number
}): Promise<GithubIssueResponse | null> => {
  try {
    const response = await fetch(
      buildApiUrl(repo.owner, repo.name, `/issues/${issueNumber}`),
      { headers: buildHeaders(githubToken) },
    )
    if (!response.ok) throw new Error(`Failed to fetch issue (${response.status})`)
    return await response.json() as GithubIssueResponse
  } catch (error) {
    logger.error('Failed to fetch issue details', error)
    return null
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

const processInvalidLabels = async ({ userId, issue, issueUrl, githubToken, onProgress }: {
  userId: string
  issue: GithubIssueResponse
  issueUrl: string
  githubToken: string
  onProgress: (message: string, variant?: string, done?: boolean) => Promise<void>
}): Promise<boolean> => {
  const labels = issue.labels || []
  const invalidNames = labels
    .map((label) => label?.name)
    .filter((name): name is string => typeof name === 'string' && name.startsWith('invalid:'))

  if (!invalidNames.length) return false

  let labelDescriptions: Record<string, string> = {}
  try {
    const allLabels = await fetchRepoIssueLabels(githubToken)
    labelDescriptions = allLabels.reduce<Record<string, string>>((acc, label) => {
      if (label.name && label.description) {
        acc[label.name] = label.description
      }
      return acc
    }, {})
  } catch (error) {
    logger.error('Failed to resolve label descriptions', error)
  }

  for (const name of invalidNames) {
    const description = labelDescriptions[name]
    await sendNotification(userId, {
      icon: 'warning',
      title: 'Report Validation Failed',
      body: description || 'Your report failed automated validation. Please review the details on GitHub.',
      variant: 'warning',
      link: issueUrl,
      linkTooltip: 'Open report on GitHub',
    })
  }

  const summary = invalidNames
    .map((name) => labelDescriptions[name])
    .filter((desc): desc is string => typeof desc === 'string' && desc.length > 0)
    .join(' ')

  await onProgress(summary || 'Your report failed automated validation. Please review the details on GitHub.', 'warning', true)
  return true
}

const processNoteLabels = async ({ userId, issue, issueUrl, githubToken, onProgress }: {
  userId: string
  issue: GithubIssueResponse
  issueUrl: string
  githubToken: string
  onProgress: (message: string, variant?: string) => Promise<void>
}): Promise<boolean> => {
  const labels = issue.labels || []
  const noteNames = labels
    .map((label) => label?.name)
    .filter((name): name is string => typeof name === 'string' && name.startsWith('note:'))

  if (!noteNames.length) return false

  let labelDescriptions: Record<string, string> = {}
  try {
    const allLabels = await fetchRepoIssueLabels(githubToken)
    labelDescriptions = allLabels.reduce<Record<string, string>>((acc, label) => {
      if (label.name && label.description) {
        acc[label.name] = label.description
      }
      return acc
    }, {})
  } catch (error) {
    logger.error('Failed to resolve note label descriptions', error)
  }

  for (const name of noteNames) {
    const description = labelDescriptions[name]
    await sendNotification(userId, {
      icon: 'info',
      title: 'Report Update',
      body: description || 'Your report includes additional notes from validation.',
      variant: 'info',
      link: issueUrl,
      linkTooltip: 'Open report on GitHub',
    })
    await onProgress(description || 'Your report includes additional notes from validation.', 'info')
  }

  return true
}
