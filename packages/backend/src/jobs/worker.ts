import { Worker } from 'bullmq'
import type { Job } from 'bullmq'
import logger, { logMetric } from '../logger'
import { redisConnectionOptions } from '../redis'
import { GITHUB_MONITOR_QUEUE_NAME } from './githubMonitor/queue'
import { run as githubMonitorProcessor } from './githubMonitor/processor'
import { GITHUB_DATA_QUEUE_NAME } from './updateGitHubData/queue'
import { run as updateGitHubDataProcessor } from './updateGitHubData/processor'
import { DAILY_TASKS_QUEUE_NAME } from './dailyTasks/queue'
import { run as dailyTasksProcessor } from './dailyTasks/processor'
import { WORKER_RECOVERY_OPTIONS } from './options'

const jobMetricFields = (queueName: string, job: Job | undefined) => ({
  queue_name: queueName,
  job_id: job?.id ?? 'unknown',
  job_name: job?.name ?? 'unknown',
  attempts_made: job?.attemptsMade ?? 0,
  attempts_started: job?.attemptsStarted ?? 0,
})

const attachWorkerTelemetry = (worker: Worker, queueName: string): Worker => {
  worker.on('active', (job) => {
    logMetric('bullmq_job_active', `${queueName}:${job.id}`, jobMetricFields(queueName, job))
  })
  worker.on('completed', (job) => {
    logMetric('bullmq_job_completed', `${queueName}:${job.id}`, {
      ...jobMetricFields(queueName, job),
      duration_ms: job.processedOn ? Date.now() - job.processedOn : null,
    })
  })
  worker.on('failed', (job, error) => {
    logMetric('bullmq_job_failed', `${queueName}:${job?.id ?? 'unknown'}`, {
      ...jobMetricFields(queueName, job),
      error_message: error.message,
    })
  })
  worker.on('stalled', (jobId, prev) => {
    logMetric('bullmq_job_stalled', `${queueName}:${jobId}`, {
      queue_name: queueName,
      job_id: jobId,
      previous_state: prev,
    })
  })
  worker.on('lockRenewalFailed', (jobIds) => {
    logMetric('bullmq_lock_renewal_failed', queueName, {
      queue_name: queueName,
      job_ids: jobIds.join(','),
      job_count: jobIds.length,
    })
  })
  worker.on('error', (error) => {
    logger.error(`BullMQ worker error for queue '${queueName}'`, error)
    logMetric('bullmq_worker_error', queueName, {
      queue_name: queueName,
      error_message: error.message,
    })
  })
  return worker
}

export function initializeWorkers(): Worker[] {
  logger.info('Initializing BullMQ workers...')

  const workers = [
    attachWorkerTelemetry(
      new Worker(GITHUB_MONITOR_QUEUE_NAME, githubMonitorProcessor, {
        connection: redisConnectionOptions,
        concurrency: 5,
        limiter: {
          max: 100,
          duration: 10000,
        },
        ...WORKER_RECOVERY_OPTIONS,
      }),
      GITHUB_MONITOR_QUEUE_NAME
    ),
    attachWorkerTelemetry(
      new Worker(GITHUB_DATA_QUEUE_NAME, updateGitHubDataProcessor, {
        connection: redisConnectionOptions,
        concurrency: 1,
        ...WORKER_RECOVERY_OPTIONS,
      }),
      GITHUB_DATA_QUEUE_NAME
    ),
    attachWorkerTelemetry(
      new Worker(DAILY_TASKS_QUEUE_NAME, dailyTasksProcessor, {
        connection: redisConnectionOptions,
        concurrency: 1,
        ...WORKER_RECOVERY_OPTIONS,
      }),
      DAILY_TASKS_QUEUE_NAME
    ),
  ]

  logger.info('All workers have been initialized.')
  return workers
}

export const closeWorkers = async (workers: Worker[]): Promise<void> => {
  await Promise.allSettled(workers.map((worker) => worker.close()))
}
