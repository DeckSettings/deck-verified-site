import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'
import { DEFAULT_JOB_OPTIONS } from '../options'

export const GITHUB_DATA_QUEUE_NAME = 'github-data-updates'

export const githubDataQueue = new Queue(GITHUB_DATA_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
})
