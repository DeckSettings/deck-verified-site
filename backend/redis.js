const redis = require('redis')
const logger = require('./logger')

// Redis config
const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = process.env.REDIS_PORT || 6379
const redisPassword = process.env.REDIS_PASSWORD || null

// Redis connection
const redisClient = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort
  },
  password: redisPassword
})

const createRedisSearchIndex = async () => {
  try {
    // Check if the index already exists
    const indexExists = await redisClient.ft.info('games_idx').catch(() => null)

    if (!indexExists) {
      logger.info('Creating RedisSearch index...')

      // Create the index with a game name (TEXT) and appid (NUMERIC)
      await redisClient.ft.create(
        'games_idx',
        {
          appsearch: { type: 'TEXT', SORTABLE: true }  // Searchable index. Other fields can be added, but will not be searchable.
        },
        {
          ON: 'HASH',
          PREFIX: 'game:'
        }
      )
      logger.info('RedisSearch index created.')
    }
  } catch (error) {
    logger.error('Error creating RedisSearch index:', error)
  }
}

const connectToRedis = async () => {
  redisClient.on('connect', () => {
    logger.info('Connected to Redis!')
  })
  redisClient.on('error', (err) => {
    logger.error('Redis connection error:', err)
  })
  try {
    // Connect to redis
    await redisClient.connect()
    // Create redis search index
    await createRedisSearchIndex()
  } catch (err) {
    logger.error('Error connecting to Redis:', err)
    process.exit(1)
  }
}

module.exports = { redisClient, connectToRedis }
