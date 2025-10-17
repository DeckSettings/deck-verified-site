import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file (if not already loaded)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const requiredEnvVars = [
  'GH_TOKEN',
]
const missingVars: string[] = []

// Validate required environment variables
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    missingVars.push(key)
  }
})
if (missingVars.length > 0) {
  console.error(`ERROR! Required environment variables: ${missingVars.join(', ')}`)
  process.exit(1)
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  siteBaseUrl: process.env.BASE_URL || 'https://deckverified.games',
  defaultGithubAuthToken: process.env.GH_TOKEN || null,
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD || 'mySecretPassword',
  defaultCacheTime: parseInt(process.env.DEFAULT_CACHE_TIME || '21600', 10),
  proxyCount: parseInt(process.env.REVERSE_PROXY_COUNT || '0', 10),
  enableRateLimiter: (process.env.DISABLE_RATE_LIMITER !== 'true'),
  runScheduledTaskOnStart: (process.env.RUN_SCHEDULED_TASKS_ON_START === 'true'),
  bloggerApiKey: process.env.BLOGGER_API_KEY || null,
  isThereAnyDealApiKey: process.env.ISTHEREANYDEAL_API_KEY || null,
  isThereAnyDealCountry: (process.env.ISTHEREANYDEAL_COUNTRY || 'US').toUpperCase(),
  // GitHub App PKCE flow
  githubAppClientId: process.env.GITHUB_APP_CLIENT_ID || null,
  githubAppClientSecret: process.env.GITHUB_APP_CLIENT_SECRET || null,
  githubAppConfigured: Boolean(process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET),
  githubPublicWebOrigins: (process.env.PUBLIC_WEB_ORIGINS || '').split(',')
    .map(s => s.trim())
    .filter(Boolean),
  jwtSecret: process.env.DV_AUTH_JWT_SECRET || null,
}

export default config

if (config.githubAppConfigured && !config.jwtSecret) {
  console.error('ERROR! DV_AUTH_JWT_SECRET must be configured when GitHub login is enabled.')
  process.exit(1)
}
