<script setup lang="ts">
import { useNotifications } from 'src/composables/useNotifications'

// Notification menu section rendered inside the authenticated user dropdown.

const {
  isActive,
  notifications,
  hasNotifications,
  dismissNotification,
  dismissAll,
} = useNotifications()

const handleDismiss = (id: string) => {
  dismissNotification(id)
}

const handleDismissAll = () => {
  dismissAll()
}

const handleOpenLink = (link: string) => {
  if (!link) return
  window.open(link, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <section v-if="isActive" class="notification-menu column q-gutter-sm q-mt-md q-mt-md-none">
    <div class="row items-center justify-between no-wrap">
      <div class="row items-center no-wrap text-subtitle2">
        <span>Notifications</span>
        <q-badge
          v-if="hasNotifications"
          class="q-ml-sm"
          color="primary"
          text-color="white"
          rounded
        >
          {{ notifications.length }}
        </q-badge>
      </div>
      <q-btn
        v-if="hasNotifications"
        flat
        dense
        size="sm"
        color="primary"
        label="Dismiss All"
        @click="handleDismissAll"
      />
    </div>

    <q-list v-if="hasNotifications" class="notification-menu-list" aria-label="User notifications" dense>
      <template v-for="(notification, idx) in notifications" :key="notification.id">
        <q-item class="notification-menu-item" clickable v-ripple>
          <q-item-section avatar>
            <q-icon
              :name="notification.icon"
              size="sm"
              :class="`text-${notification.variant}`"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ notification.title }}</q-item-label>
            <q-item-label caption>
              {{ notification.body }}
            </q-item-label>
          </q-item-section>
          <q-item-section side class="row items-center no-wrap q-gutter-xs">
            <q-btn
              flat
              dense
              round
              icon="close"
              size="sm"
              aria-label="Dismiss notification"
              @click.stop="handleDismiss(notification.id)">
              <q-tooltip>Dismiss notification</q-tooltip>
            </q-btn>
            <q-btn
              v-if="notification.link"
              flat
              dense
              round
              icon="open_in_new"
              color="primary"
              size="sm"
              aria-label="Open related link"
              @click.stop="handleOpenLink(notification.link)">
              <q-tooltip>{{ notification.linkTooltip ?? 'Open link' }}</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>

        <q-separator dark spaced inset v-if="idx < notifications.length - 1" />
      </template>
    </q-list>

    <div v-else class="notification-menu-empty text-caption text-center q-pt-xs">
      You're all caught up.
    </div>
  </section>
</template>

<style scoped>
.notification-menu-list {
  border-radius: 3px;
  background: color-mix(in srgb, var(--q-dark) 75%, transparent);
  margin-left: 0;
}

.notification-menu-item {
  margin-left: 0;
  padding-left: 8px;
}

.notification-menu-item :deep(.q-item__label--caption) {
  opacity: 0.8;
}

.notification-menu-empty {
  opacity: 0.7;
}
</style>
