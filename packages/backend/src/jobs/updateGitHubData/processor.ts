import { fetchRepoIssueLabels } from '../../external/decksettings/repo_issue_labels'
import { fetchReportBodySchema } from '../../external/decksettings/report_body_schema'
import { fetchGameReportTemplate } from '../../external/decksettings/game_report_template'
import { fetchHardwareInfo } from '../../external/decksettings/hw_info'
import type { Job } from 'bullmq'
import { refreshScheduledReportCaches } from '../../external/decksettings/reports'
import { updateGameIndex } from '../../external/decksettings/projects'
import logger from '../../logger'
import config from '../../config'

/**
 * BullMQ job processor for the scheduled GitHub data update.
 */
interface UpdateGitHubDataProgress {
  cursor?: string | null
  phase?: 'reports-complete' | 'indexing' | 'index-complete' | 'complete'
  projectsProcessed?: number
}

const getProgress = (job: Job | undefined): UpdateGitHubDataProgress => {
  if (!job || typeof job.progress !== 'object' || job.progress === null) {
    return {}
  }
  return job.progress as UpdateGitHubDataProgress
}

export async function run(job?: Job): Promise<void> {
  logger.info('Running scheduled job: updateGitHubData')
  try {
    const authToken = config.defaultGithubAuthToken
    const progress = getProgress(job)

    if (progress.phase === 'complete') {
      logger.info(`Scheduled job updateGitHubData already completed for job ${job?.id ?? 'unknown'}.`)
      return
    }
    if (progress.phase === 'index-complete') {
      await job?.updateProgress({ phase: 'complete' } satisfies UpdateGitHubDataProgress)
      logger.info(`Finished scheduled job: updateGitHubData (resumed after completed index).`)
      return
    }

    let resumeProgress = progress
    if (!progress.phase) {
      // Refresh supporting data only once per BullMQ job. A stalled retry resumes
      // from job progress instead of consuming the same GitHub rate limit again.
      await fetchReportBodySchema(authToken, true)
      await fetchHardwareInfo(authToken, true)
      await fetchGameReportTemplate(authToken, true)
      await fetchRepoIssueLabels(authToken, true)

      // Fetch each 20-item dataset once. The five-item caches are derived locally,
      // reducing GitHub requests and GraphQL/REST rate-limit consumption.
      await refreshScheduledReportCaches(authToken)
      resumeProgress = { phase: 'reports-complete' }
      await job?.updateProgress(resumeProgress satisfies UpdateGitHubDataProgress)
    }

    await updateGameIndex(authToken, {
      startCursor: resumeProgress.phase === 'indexing' ? resumeProgress.cursor : null,
      onPageComplete: async (pageInfo, projectsProcessed) => {
        await job?.updateProgress({
          phase: pageInfo.hasNextPage ? 'indexing' : 'index-complete',
          cursor: pageInfo.endCursor,
          projectsProcessed,
        } satisfies UpdateGitHubDataProgress)
      },
    })
    await job?.updateProgress({ phase: 'complete' } satisfies UpdateGitHubDataProgress)
    logger.info('Finished scheduled job: updateGitHubData')
  } catch (error) {
    logger.error('Scheduled job updateGitHubData failed', error)
    // Re-throw the error to let BullMQ know the job has failed
    throw error
  }
}
