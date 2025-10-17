import logger from '../logger'
import config from '../config'
import { githubDataQueue } from './updateGitHubData/queue'

export async function initScheduledTasks(): Promise<void> {
  try {
    const schedulerName = 'github-data-update'
    const schedulePattern = '30 45 * * * *' // At 45 minutes and 30 seconds past every hour

    // Remove any existing schedulers for this job to ensure a clean slate
    try {
      logger.info(`Cleaning existing job schedulers for '${schedulerName}'.`)
      const existingSchedulers = await githubDataQueue.getJobSchedulers(0, 1000, true)
      let removedCount = 0
      for (const s of existingSchedulers) {
        try {
          const ok = await githubDataQueue.removeJobScheduler(s.key)
          if (ok) removedCount += 1
        } catch (err) {
          logger.warn(`Failed to remove job scheduler '${s.key}'`, err)
        }
      }
      logger.info(`Removed ${removedCount} existing job scheduler(s).`)
    } catch (err) {
      logger.warn('Failed to enumerate existing job schedulers. Proceeding.', err)
    }

    // Upsert the scheduled job
    await githubDataQueue.upsertJobScheduler(
      schedulerName,
      {
        pattern: schedulePattern,
        immediately: config.runScheduledTaskOnStart,
      },
    )
    logger.info(`Scheduled repeatable job '${schedulerName}' on pattern '${schedulePattern}'.`)
  } catch (error) {
    logger.error('Failed to schedule GitHub data update', error)
  }
}
