import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from 'stores/notification-store'
import { useAuthStore } from 'stores/auth-store'
import { useFeatureFlags } from './useFeatureFlags'

/**
 * Centralised helper for interacting with the notification store while
 * respecting authentication and feature flag state.
 */
export const useNotifications = () => {
  const { enableLogin } = useFeatureFlags()
  const authStore = useAuthStore()
  const notificationStore = useNotificationStore()
  const { notifications, hasNotifications } = storeToRefs(notificationStore)

  const isActive = computed(() => enableLogin && authStore.isLoggedIn)

  return {
    isActive,
    notifications,
    hasNotifications,
    pushNotification: notificationStore.pushNotification,
    dismissNotification: notificationStore.dismissNotification,
    dismissAll: notificationStore.dismissAll,
  }
}

export type { UserNotification } from 'stores/notification-store'
