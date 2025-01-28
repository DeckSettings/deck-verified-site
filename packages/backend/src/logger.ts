import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
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
    ...additionalData
  }
  logger.info(metricData)
}

export default logger
