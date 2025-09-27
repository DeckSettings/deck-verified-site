<template>
  <section v-if="isActive" class="notification-menu column q-gutter-sm q-mt-none">
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

    <q-list
      v-if="hasNotifications"
      class="notification-menu__list"
      aria-label="User notifications"
      dense
      bordered
    >
      <q-item
        v-for="notification in notifications"
        :key="notification.id"
        class="notification-menu__item"
        clickable
        v-ripple
      >
        <q-item-section avatar>
          <q-icon :name="notification.icon" size="sm" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-medium">{{ notification.title }}</q-item-label>
          <q-item-label caption class="text-white">{{ notification.body }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            flat
            dense
            round
            icon="close"
            size="sm"
            aria-label="Dismiss notification"
            @click.stop="handleDismiss(notification.id)"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <div v-else class="notification-menu__empty text-caption text-center q-pt-xs">
      You're all caught up.
    </div>
  </section>
</template>

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
</script>

<style scoped>
.notification-menu__list {
  border-radius: 12px;
  background: color-mix(in srgb, var(--q-dark) 75%, transparent);
}

.notification-menu__item :deep(.q-item__label--caption) {
  opacity: 0.8;
}

.notification-menu__empty {
  opacity: 0.7;
}
</style>
