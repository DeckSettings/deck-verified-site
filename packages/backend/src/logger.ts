import winston from 'winston'
import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'
import type { RequestHandler } from 'express'

const als = new AsyncLocalStorage<Record<string, any>>()

export const getRequestId = (): string | undefined => {
  const store = als.getStore()
  return store?.requestId
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = (req.headers['x-request-id'] as string) || undefined
  const id = incoming || randomUUID()
  // Create a request-scoped store and run the rest of the request handling inside it.
  als.run({ requestId: id }, () => {
    // Ensure clients always get back the request id the server used.
    res.setHeader('X-Request-ID', id)
    next()
  })
}

const injectRequestIdFormat = winston.format((info) => {
  try {
    const rid = getRequestId()
    if (rid) {
      if (!info.request_id) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        info.request_id = rid
      }
    }
  } catch (e) {
    // Ignore
  }
  return info
})()

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    injectRequestIdFormat,
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
  ],
})

/**
 * Logs a metric in JSON format.
 *
 * @param metricName - The name of the metric.
 * @param metricValue - The value of the metric.
 * @param additionalData - Additional context or metadata to include.
 */
export const logMetric = (metricName: string, metricValue: any, additionalData: Record<string, any> = {}) => {
  const metricData = {
    log_type: 'METRIC',
    source_project: 'deck-verified-api',
    metric_name: metricName,
    metric_value: metricValue,
    metric_timestamp: new Date().toISOString(),
    ...additionalData,
  }
  logger.info(metricData)
}

export default logger
