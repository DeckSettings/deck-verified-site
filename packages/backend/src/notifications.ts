import { randomUUID } from 'crypto'
import type { NotificationEnvelope, PersistedNotification, UserNotification } from '../../shared/src/notifications'
import logger from './logger'
import { ensureRedisConnection, redisClient } from './redis'

interface PersistedEnvelope extends NotificationEnvelope {
}

const buildRedisKey = (userId: string): string => `dv:${userId}:notifications`

const emptyEnvelope = (): PersistedEnvelope => ({ notifications: [], updatedAt: 0 })

const parseEnvelope = (raw: string | null): PersistedEnvelope => {
  if (!raw) {
    return emptyEnvelope()
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationEnvelope>
    const notifications = Array.isArray(parsed?.notifications)
      ? parsed.notifications.filter((record): record is PersistedNotification => (
        !!record
        && typeof record.id === 'string'
        && !!record.id
        && typeof record.icon === 'string'
        && typeof record.title === 'string'
        && typeof record.body === 'string'
        && typeof record.createdAt === 'number'
      ))
      : []
    const updatedAt = typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0
    return { notifications, updatedAt }
  } catch (error) {
    logger.warn('Failed to parse notifications envelope; resetting to empty', error)
    return emptyEnvelope()
  }
}

const persistEnvelope = async (userId: string, envelope: PersistedEnvelope): Promise<PersistedEnvelope> => {
  await ensureRedisConnection()
  const payload: PersistedEnvelope = {
    notifications: envelope.notifications,
    updatedAt: envelope.updatedAt || Date.now(),
  }
  await redisClient.set(buildRedisKey(userId), JSON.stringify(payload))
  return payload
}

export const loadNotifications = async (userId: string): Promise<PersistedEnvelope> => {
  await ensureRedisConnection()
  const cached = await redisClient.get(buildRedisKey(userId))
  return parseEnvelope(cached)
}

export const appendNotification = async (userId: string, notification: UserNotification): Promise<PersistedEnvelope> => {
  const envelope = await loadNotifications(userId)
  const entry: PersistedNotification = {
    id: randomUUID(),
    createdAt: Date.now(),
    icon: notification.icon,
    title: notification.title,
    body: notification.body,
  }

  if (typeof notification.link === 'string' && notification.link) entry.link = notification.link
  if (typeof notification.variant === 'string' && notification.variant) entry.variant = notification.variant
  if (typeof notification.linkTooltip === 'string' && notification.linkTooltip) entry.linkTooltip = notification.linkTooltip

  const notifications = [entry, ...envelope.notifications]
  return persistEnvelope(userId, { notifications, updatedAt: Date.now() })
}

export const removeNotification = async (userId: string, id: string): Promise<PersistedEnvelope> => {
  const envelope = await loadNotifications(userId)
  const notifications = envelope.notifications.filter((entry) => entry.id !== id)
  return persistEnvelope(userId, { notifications, updatedAt: Date.now() })
}

export const clearNotifications = async (userId: string): Promise<PersistedEnvelope> => {
  return persistEnvelope(userId, { notifications: [], updatedAt: Date.now() })
}


export const sanitizeNotificationInput = (input: unknown): UserNotification | null => {
  if (!input || typeof input !== 'object') {
    return null
  }
  const candidate = input as Partial<UserNotification>
  const icon = typeof candidate.icon === 'string' ? candidate.icon.trim() : ''
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
  const body = typeof candidate.body === 'string' ? candidate.body.trim() : ''
  if (!icon || !title || !body) {
    return null
  }

  const payload: UserNotification = { icon, title, body }
  if (typeof candidate.link === 'string' && candidate.link.trim()) payload.link = candidate.link.trim()
  if (typeof candidate.linkTooltip === 'string' && candidate.linkTooltip.trim()) payload.linkTooltip = candidate.linkTooltip.trim()
  if (typeof candidate.variant === 'string' && candidate.variant.trim()) payload.variant = candidate.variant.trim()
  return payload
}
