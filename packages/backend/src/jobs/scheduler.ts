import type { Queue } from 'bullmq'
import logger from '../logger'
import config from '../config'
import { githubDataQueue } from './updateGitHubData/queue'
import { dailyTasksQueue } from './dailyTasks/queue'

interface JobScheduleConfig {
  queue: Queue
  schedulerName: string
  schedulePattern: string
  immediately: boolean
}

const JOB_SCHEDULES: JobScheduleConfig[] = [
  {
    queue: githubDataQueue,
    schedulerName: 'github-data-update',
    schedulePattern: '30 45 * * * *', // At 45 minutes and 30 seconds past every hour
    immediately: config.runScheduledTaskOnStart,
  },
  {
    queue: dailyTasksQueue,
    schedulerName: 'dailyTasks',
    schedulePattern: '30 15 10 * * *', // Once per day at 1015 and 30 seconds
    immediately: false,
  },
]

export async function initScheduledTasks(): Promise<void> {
  for (const job of JOB_SCHEDULES) {
    await configureJobScheduler(job)
  }
}

async function configureJobScheduler({
                                       queue,
                                       schedulerName,
                                       schedulePattern,
                                       immediately,
                                     }: JobScheduleConfig): Promise<void> {
  try {
    logger.info(`Cleaning existing job schedulers for '${schedulerName}'.`)
    const existingSchedulers = await queue.getJobSchedulers(0, 1000, true)
    let removedCount = 0
    for (const s of existingSchedulers) {
      try {
        const ok = await queue.removeJobScheduler(s.key)
        if (ok) removedCount += 1
      } catch (err) {
        logger.warn(`Failed to remove job scheduler '${s.key}' for '${schedulerName}'`, err)
      }
    }
    logger.info(`Removed ${removedCount} existing job scheduler(s) for '${schedulerName}'.`)
  } catch (err) {
    logger.warn(`Failed to enumerate existing job schedulers for '${schedulerName}'. Proceeding.`, err)
  }

  try {
    await queue.upsertJobScheduler(
      schedulerName,
      {
        pattern: schedulePattern,
        immediately,
      },
    )
    logger.info(`Scheduled repeatable job '${schedulerName}' on pattern '${schedulePattern}'.`)
  } catch (error) {
    logger.error(`Failed to schedule job '${schedulerName}'`, error)
  }
}
