import type { Queue } from 'bullmq'
import logger from '../logger'
import config from '../config'
import { githubDataQueue } from './updateGitHubData/queue'
import { dailyTasksQueue } from './dailyTasks/queue'
import { DEFAULT_JOB_OPTIONS } from './options'

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
    await queue.upsertJobScheduler(
      schedulerName,
      {
        pattern: schedulePattern,
        immediately,
      },
      {
        name: schedulerName,
        opts: DEFAULT_JOB_OPTIONS,
      }
    )
    logger.info(`Scheduled repeatable job '${schedulerName}' on pattern '${schedulePattern}'.`)
  } catch (error) {
    logger.error(`Failed to schedule job '${schedulerName}'`, error)
  }
}
