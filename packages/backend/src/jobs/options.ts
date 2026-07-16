import type { DefaultJobOptions, WorkerOptions } from 'bullmq'

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 500,
  },
}

export const WORKER_RECOVERY_OPTIONS: Pick<
  WorkerOptions,
  'lockDuration' | 'maxStalledCount' | 'maxStartedAttempts' | 'stalledInterval' | 'removeOnComplete' | 'removeOnFail'
> = {
  lockDuration: 5 * 60 * 1000,
  maxStalledCount: 1,
  maxStartedAttempts: 2,
  stalledInterval: 60 * 1000,
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 500,
  },
}
