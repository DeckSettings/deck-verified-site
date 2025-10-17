import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'

export const GITHUB_DATA_QUEUE_NAME = 'github-data-updates'

export const githubDataQueue = new Queue(GITHUB_DATA_QUEUE_NAME, {
  connection: redisConnectionOptions,
})
