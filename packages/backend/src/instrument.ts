import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      // Add our Profiling integration
      nodeProfilingIntegration(),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for tracing.
    // We recommend adjusting this value in production
    // Learn more at
    // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#tracesSampleRate
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
      ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : 0.1,
  })

  const scope = Sentry.getCurrentScope()
  if (scope) {
    if (process.env.SENTRY_SERVICE_NAME) {
      scope.setTag('service_name', process.env.SENTRY_SERVICE_NAME)
    }
    if (process.env.SENTRY_DOCKER_IMAGE_TAG) {
      scope.setTag('docker_image_tag', process.env.SENTRY_DOCKER_IMAGE_TAG)
    }
  }
}
