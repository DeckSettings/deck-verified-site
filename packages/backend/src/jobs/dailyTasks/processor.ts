import logger from '../../logger'
import { getMaxSteamAppId } from '../../external/steam'

export async function run(): Promise<void> {
  logger.info('Running scheduled job: dailyTasks')
  try {
    // TODO: PLACE DAILY FUNCTIONS CALLS HERE

    const today = new Date()
    const isOddDay = today.getUTCDate() % 2 === 1
    if (isOddDay) {
      // These will run basically every 2 days
      await Promise.all([
        getMaxSteamAppId(true),
      ])
    }

    logger.info('Finished scheduled job: dailyTasks')
  } catch (error) {
    logger.error('Scheduled job dailyTasks failed', error)
    throw error
  }
}
