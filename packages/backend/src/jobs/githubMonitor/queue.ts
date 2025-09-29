import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'

export const GITHUB_MONITOR_QUEUE_NAME = 'github-actions-monitor'

export const githubMonitorQueue = new Queue(GITHUB_MONITOR_QUEUE_NAME, {
  connection: redisConnectionOptions,
})
