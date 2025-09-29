import { Worker } from 'bullmq'
import logger from '../logger'
import { redisConnectionOptions } from '../redis'
import { GITHUB_MONITOR_QUEUE_NAME } from './githubMonitor/queue'
import { run as githubMonitorProcessor } from './githubMonitor/processor'
import { GAME_INDEX_QUEUE_NAME } from './updateGameIndex/queue'
import { run as updateGameIndexProcessor } from './updateGameIndex/processor'

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

  // --- Game Index Worker ---
  new Worker(GAME_INDEX_QUEUE_NAME, updateGameIndexProcessor, {
    connection: redisConnectionOptions,
    concurrency: 1, // Only one of these should run at a time
  })

  logger.info('All workers have been initialized.')
}
