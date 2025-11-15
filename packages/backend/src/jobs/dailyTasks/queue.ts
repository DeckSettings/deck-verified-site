import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'

export const DAILY_TASKS_QUEUE_NAME = 'daily-tasks'

export const dailyTasksQueue = new Queue(DAILY_TASKS_QUEUE_NAME, {
  connection: redisConnectionOptions,
})
