const redis = require('redis')

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
      console.log('Creating RedisSearch index...')

      // Create the index with a game name (TEXT) and appid (NUMERIC)
      await redisClient.ft.create(
        'games_idx',
        {
          appsearch: { type: 'TEXT', SORTABLE: true },  // Searchable index
          appname: { type: 'TEXT', SORTABLE: true },    // Full game name
          appid: { type: 'TEXT', SORTABLE: true },      // App ID
          appposter: { type: 'TEXT', SORTABLE: true }   // App poster
        },
        {
          ON: 'HASH',
          PREFIX: 'game:'
        }
      )
      console.log('RedisSearch index created.')
    }
  } catch (error) {
    console.error('Error creating RedisSearch index:', error)
  }
}

const connectToRedis = async () => {
  redisClient.on('connect', () => {
    console.log('Connected to Redis!')
  })
  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err)
  })
  try {
    // Connect to redis
    await redisClient.connect()
    // Create redis search index
    await createRedisSearchIndex()
  } catch (err) {
    console.error('Error connecting to Redis:', err)
    process.exit(1)
  }
}

module.exports = { redisClient, connectToRedis }
