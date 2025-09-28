import { useQuasar } from 'quasar'
import type { QNotifyCreateOptions, QNotifyUpdateOptions } from 'quasar'

export type ProgressValue = number | 'indeterminate' | null

export interface ProgressNotificationPayload {
  icon?: string
  title: string
  message: string
  progress: ProgressValue
}

export interface ProgressNotificationHandle {
  update: (payload: Partial<ProgressNotificationPayload>) => void
  finish: (delayMs?: number) => void
  dismiss: () => void
}

const buildOptions = (payload: ProgressNotificationPayload): QNotifyCreateOptions => {
  const { icon, title, message, progress } = payload

  const options: QNotifyCreateOptions = {
    group: false,
    message: title,
    caption: message,
    timeout: 0,
    position: 'bottom-left',
    color: 'dark',
    textColor: 'white',
    classes: 'bg-dark text-white',
    multiLine: true,
  }

  if (icon) {
    options.icon = icon
  }

  if (progress === null) {
    options.progress = false
  } else if (progress === 'indeterminate') {
    options.progress = true
  } else {
    options.progress = true
    const clamped = Math.max(0, Math.min(100, progress))
    options.caption = `${message} (${clamped}% complete)`
  }

  return options
}

/**
 * Displays a Quasar progress notification and returns helpers to mutate it.
 */
export const useProgressNotifications = () => {
  const $q = useQuasar()

  const createProgressNotification = (initial: ProgressNotificationPayload): ProgressNotificationHandle => {
    const current: ProgressNotificationPayload = { ...initial }
    const notif = $q.notify(buildOptions(current))

    const update = (patch: Partial<ProgressNotificationPayload>) => {
      Object.assign(current, patch)
      notif(buildOptions(current) as QNotifyUpdateOptions)
    }

    const finish = (delayMs = 2500) => {
      Object.assign(current, { progress: null })
      notif({
        ...(buildOptions(current) as QNotifyUpdateOptions),
        timeout: delayMs,
      })
    }

    const dismiss = () => {
      notif()
    }

    return { update, finish, dismiss }
  }

  return { createProgressNotification }
}

export type { ProgressNotificationPayload as ProgressNotification }
