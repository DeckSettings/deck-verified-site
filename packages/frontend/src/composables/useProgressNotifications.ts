import { ref } from 'vue'
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

/**
 * Internal: same payload with an id so we can track/removal in mobile state
 */
interface MobileProgressEntry extends ProgressNotificationPayload {
  id: number
}

/**
 * Mobile-backed reactive state:
 * - On mobile UI builds we will push progress entries here instead of using $q.notify.
 * - This state is intended to be read by a component (e.g. placed in HeaderUserMenu)
 *   which will render these entries in the UI.
 */
export const mobileProgressState = ref<MobileProgressEntry[]>([])

let nextMobileProgressId = 1

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
 * Displays a Quasar progress notification (desktop/web) or writes to
 * `mobileProgressState` (mobile UI builds). Returns helpers to mutate it.
 */
export const useProgressNotifications = () => {
  const $q = useQuasar()

  const createProgressNotification = (initial: ProgressNotificationPayload): ProgressNotificationHandle => {
    if ($q.platform.isMobileUi) {
      // Mobile-backed: manage entry in `mobileProgressState`
      const id = nextMobileProgressId++
      const current: MobileProgressEntry = { id, ...initial }
      mobileProgressState.value.push(current)

      const findIndex = () => mobileProgressState.value.findIndex(e => e.id === id)

      const update = (patch: Partial<ProgressNotificationPayload>) => {
        const idx = findIndex()
        if (idx === -1) return
        const el = mobileProgressState.value[idx]
        if (!el) return
        Object.assign(el, patch)
      }

      const finish = (delayMs = 2500) => {
        const idx = findIndex()
        if (idx === -1) return
        const el = mobileProgressState.value[idx]
        if (!el) return
        // mark as finished (no progress bar)
        el.progress = null
        // remove after delay
        setTimeout(() => {
          const removeIdx = findIndex()
          if (removeIdx !== -1) {
            mobileProgressState.value.splice(removeIdx, 1)
          }
        }, delayMs)
      }

      const dismiss = () => {
        const idx = findIndex()
        if (idx === -1) return
        mobileProgressState.value.splice(idx, 1)
      }

      return { update, finish, dismiss }
    }

    // Desktop/web: use Quasar notify as before
    const current: ProgressNotificationPayload = { ...initial }

    // The Quasar notify call returns a value that can be used to update/dismiss the notification.
    // To avoid typing issues we'll explicitly type the shape we expect here.
    type NotifFn = (opts?: QNotifyUpdateOptions) => void
    const raw = $q.notify(buildOptions(current))
    const notif = (raw as unknown) as NotifFn

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
      // calling with no args triggers dismissal in Quasar
      notif()
    }

    return { update, finish, dismiss }
  }

  return { createProgressNotification }
}

export type { ProgressNotificationPayload as ProgressNotification }
