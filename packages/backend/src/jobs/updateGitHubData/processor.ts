import { fetchIssueLabels, updateGameIndex as updateGameIndexLogic } from '../../github'
import logger from '../../logger'

/**
 * BullMQ job processor for the scheduled GitHub data update.
 */
export async function run(): Promise<void> {
  logger.info('Running scheduled job: updateGitHubData')
  try {
    await fetchIssueLabels(null, true)
    await updateGameIndexLogic()
    logger.info('Finished scheduled job: updateGitHubData')
  } catch (error) {
    logger.error('Scheduled job updateGitHubData failed', error)
    // Re-throw the error to let BullMQ know the job has failed
    throw error
  }
}
