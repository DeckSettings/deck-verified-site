import { Worker } from 'bullmq'
import logger from '../logger'
import { redisConnectionOptions } from '../redis'
import { GITHUB_MONITOR_QUEUE_NAME } from './githubMonitor/queue'
import { run as githubMonitorProcessor } from './githubMonitor/processor'
import { GITHUB_DATA_QUEUE_NAME } from './updateGitHubData/queue'
import { run as updateGitHubDataProcessor } from './updateGitHubData/processor'
import { DAILY_TASKS_QUEUE_NAME } from './dailyTasks/queue'
import { run as dailyTasksProcessor } from './dailyTasks/processor'

export function initializeWorkers() {
  logger.info('Initializing BullMQ workers...')

  // --- GitHub Monitor Worker ---
  new Worker(GITHUB_MONITOR_QUEUE_NAME, githubMonitorProcessor, {
    connection: redisConnectionOptions,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {      // Limit to 100 jobs every 10 seconds to avoid overwhelming GitHub API
      max: 100,
      duration: 10000,
    },
  })

  // --- GitHub Data Worker ---
  new Worker(GITHUB_DATA_QUEUE_NAME, updateGitHubDataProcessor, {
    connection: redisConnectionOptions,
    concurrency: 1, // Only one of these should run at a time
  })

  // --- Daily Tasks Worker ---
  new Worker(DAILY_TASKS_QUEUE_NAME, dailyTasksProcessor, {
    connection: redisConnectionOptions,
    concurrency: 1,
  })

  logger.info('All workers have been initialized.')
}
