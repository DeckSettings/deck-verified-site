/**
 * Base notification payload used across Deck Verified surfaces.
 */
export interface UserNotification {
  icon: string
  title: string
  body: string
  link?: string
  linkTooltip?: string
  variant?: string
}

/**
 * Persisted notification augmented with identifiers and timestamps.
 */
export interface PersistedNotification extends UserNotification {
  id: string
  createdAt: number
}

/**
 * Wire payload returned by the notifications API.
 */
export interface NotificationEnvelope {
  notifications: PersistedNotification[]
  updatedAt: number
}
