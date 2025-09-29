import logger from '../logger'
import config from '../config'
import { gameIndexQueue } from './updateGameIndex/queue'

/**
 * Schedules the game index update every 2 minutes using the modern upsertJobScheduler API.
 */
export async function initScheduledTasks(): Promise<void> {
  try {
    const schedulerName = 'game-index-update'
    const schedulePattern = '30 45 * * * *' // At 45 minutes and 30 seconds past every hour

    // Remove ALL existing job schedulers to ensure a clean slate
    try {
      logger.info(`Cleaning out existing ${schedulerName} job scheduler(s).`)
      const existingSchedulers = await gameIndexQueue.getJobSchedulers(0, 1000, true)
      let removedCount = 0
      for (const s of existingSchedulers) {
        try {
          const ok = await gameIndexQueue.removeJobScheduler(s.key)
          if (ok) removedCount += 1
        } catch (err) {
          logger.warn(`Failed to remove job scheduler '${s.key}'`, err)
        }
      }
      if (removedCount > 0) {
        logger.info(`Removed ${removedCount} existing job scheduler(s).`)
      } else {
        logger.info('No existing job schedulers found to remove.')
      }
    } catch (err) {
      logger.warn('Failed to enumerate existing job schedulers. Proceeding anyway.', err)
    }

    // Upserting a repeatable job in the queue
    await gameIndexQueue.upsertJobScheduler(
      schedulerName,
      {
        pattern: schedulePattern,
        immediately: config.runScheduledTaskOnStart,
      },
    )
    logger.info(`Scheduled repeatable job '${schedulerName}' to run on schedule '${schedulePattern}'.`)
  } catch (error) {
    logger.error('Failed to schedule repeatable job for game index update', error)
  }
}
