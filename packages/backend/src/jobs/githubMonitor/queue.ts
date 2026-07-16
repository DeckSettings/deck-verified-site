import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'
import { DEFAULT_JOB_OPTIONS } from '../options'

export const GITHUB_MONITOR_QUEUE_NAME = 'github-actions-monitor'

export const githubMonitorQueue = new Queue(GITHUB_MONITOR_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
})
