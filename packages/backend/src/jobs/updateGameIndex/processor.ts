import { updateGameIndex as updateGameIndexLogic } from '../../github'
import logger from '../../logger'

/**
 * BullMQ job processor for the scheduled game index update.
 */
export async function run(): Promise<void> {
  logger.info('Running scheduled job: updateGameIndex')
  try {
    await updateGameIndexLogic()
    logger.info('Finished scheduled job: updateGameIndex')
  } catch (error) {
    logger.error('Scheduled job updateGameIndex failed', error)
    // Re-throw the error to let BullMQ know the job has failed
    throw error
  }
}
