import './instrument'
import logger from './logger'
import { connectToRedis, redisClient } from './redis'
import { dailyTasksQueue } from './jobs/dailyTasks/queue'
import { githubMonitorQueue } from './jobs/githubMonitor/queue'
import { githubDataQueue } from './jobs/updateGitHubData/queue'
import { initScheduledTasks } from './jobs/scheduler'
import { closeWorkers, initializeWorkers } from './jobs/worker'

let shuttingDown = false
const workers = [] as ReturnType<typeof initializeWorkers>

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`Task service received ${signal}; shutting down.`)

  await closeWorkers(workers)
  await Promise.allSettled([dailyTasksQueue.close(), githubMonitorQueue.close(), githubDataQueue.close()])
  if (redisClient.isOpen) {
    await redisClient.quit()
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT').finally(() => process.exit(0))
})
process.on('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => process.exit(0))
})

const startTaskService = async (): Promise<void> => {
  try {
    await connectToRedis()
    workers.push(...initializeWorkers())
    await initScheduledTasks()
    logger.info('Task service initialized successfully.')
  } catch (error) {
    logger.error('Error starting task service:', error)
    await shutdown('startup-failure')
    process.exit(1)
  }
}

void startTaskService()
