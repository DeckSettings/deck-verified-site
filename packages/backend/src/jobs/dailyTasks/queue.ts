import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'
import { DEFAULT_JOB_OPTIONS } from '../options'

export const DAILY_TASKS_QUEUE_NAME = 'daily-tasks'

export const dailyTasksQueue = new Queue(DAILY_TASKS_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
})
