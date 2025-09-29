import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../../redis'

export const GAME_INDEX_QUEUE_NAME = 'game-index-updates'

export const gameIndexQueue = new Queue(GAME_INDEX_QUEUE_NAME, {
  connection: redisConnectionOptions,
})
