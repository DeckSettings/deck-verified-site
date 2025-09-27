<template>
  <div
    v-if="enableLogin"
    class="header-user-menu"
    :class="`header-user-menu--${displayMode}`"
  >
    <template v-if="displayMode === 'default'">
      <div class="header-user-menu-wrapper">
        <q-btn
          v-if="!isLoggedIn"
          flat
          dense
          no-caps
          color="white"
          icon="fab fa-github"
          label="Login"
          @click="handleLogin"
        />

        <q-btn
          v-else
          flat
          dense
          round
          color="white"
          class="header-user-menu-trigger"
          aria-haspopup="dialog"
        >
          <q-avatar size="30px">
            <img v-if="avatarUrl" :src="avatarUrl" alt="GitHub avatar">
            <span v-else>{{ userInitials }}</span>
          </q-avatar>
          <q-badge v-if="hasNotificationBadge" color="primary" floating />

          <q-menu
            anchor="bottom right"
            self="top right"
            :offset="[0, 28]"
            :style="{
              backgroundColor: 'color-mix(in srgb, var(--q-dark) 95%, transparent)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '0px 0px 3px 3px',
              boxShadow: '2px 2px 10px rgba(0, 0, 0, 0.9)',
              boxSizing: 'border-box',
            }"
            separate-close-popup
          >
            <div class="header-user-menu-content column q-pa-md q-gutter-md">
              <div class="row items-center no-wrap q-gutter-sm">
                <q-avatar size="44px">
                  <img v-if="avatarUrl" :src="avatarUrl" alt="GitHub avatar">
                  <span v-else>{{ userInitials }}</span>
                </q-avatar>
                <div class="column">
                  <span class="text-subtitle2">{{ userDisplayName }}</span>
                  <span class="text-caption text-grey-5">{{ userHandle }}</span>
                </div>
              </div>

              <NotificationCenter />

              <q-separator dark spaced />

              <div class="row items-center no-wrap q-gutter-sm">
                <q-btn
                  outline
                  color="primary"
                  icon="logout"
                  label="Logout"
                  class="full-width"
                  @click="handleLogout"
                />
              </div>
            </div>
          </q-menu>
        </q-btn>
      </div>
    </template>

    <template v-else>
      <q-btn
        flat
        dense
        round
        color="white"
        icon="menu"
        class="header-user-menu__mobile-trigger"
        aria-label="Open menu"
        @click="openMobileMenu"
      >
        <q-badge
          v-if="isLoggedIn && hasNotifications"
          color="primary"
          floating
        />
      </q-btn>

      <q-dialog
        v-model="isMobileMenuOpen"
        :position="$q.screen.gt.xs ? 'left' : undefined"
        maximized
        class="header-user-menu__mobile-dialog"
        transition-show="slide-right"
        transition-hide="slide-left"
      >
        <q-card class="header-user-menu__mobile-card bg-dark text-white">
          <q-card-section class="header-user-menu__mobile-header row items-center justify-between no-wrap">
            <div class="row items-center no-wrap q-gutter-sm">
              <q-avatar size="42px">
                <img v-if="isLoggedIn && avatarUrl" :src="avatarUrl" alt="GitHub avatar">
                <span v-else>{{ userInitials }}</span>
              </q-avatar>
              <div class="column">
                <span class="text-subtitle1 text-weight-medium">
                  {{ isLoggedIn ? userDisplayName : 'Deck Verified' }}
                </span>
                <span class="text-caption text-grey-5">
                  {{ isLoggedIn ? userHandle : 'Sign in to personalise' }}
                </span>
              </div>
            </div>
            <q-btn
              flat
              dense
              round
              icon="close"
              aria-label="Close menu"
              @click="closeMobileMenu"
            />
          </q-card-section>

          <q-separator dark />

          <q-scroll-area class="header-user-menu__mobile-scroll">
            <div class="header-user-menu__mobile-content column q-pa-md q-gutter-lg">
              <NotificationCenter v-if="isLoggedIn" />

              <div v-else class="column q-gutter-sm">
                <p class="text-body2 text-grey-4">
                  Connect your GitHub account to receive personalised notifications and save your activity.
                </p>
                <q-btn
                  color="primary"
                  text-color="white"
                  unelevated
                  icon="fab fa-github"
                  label="Login with GitHub"
                  class="full-width"
                  @click="handleLogin"
                />
              </div>

              <q-separator v-if="isLoggedIn" dark />

              <div class="column q-gutter-sm">
                <q-btn
                  v-if="isLoggedIn"
                  outline
                  color="primary"
                  icon="logout"
                  label="Logout"
                  class="full-width"
                  @click="handleLogout"
                />
                <q-btn
                  flat
                  dense
                  color="grey-5"
                  label="Close"
                  class="full-width"
                  @click="closeMobileMenu"
                />
              </div>
            </div>
          </q-scroll-area>
        </q-card>
      </q-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import NotificationCenter from 'components/NotificationCenter.vue'
import { useAuthStore } from 'stores/auth-store'
import { useFeatureFlags } from 'src/composables/useFeatureFlags'
import { useNotifications } from 'src/composables/useNotifications'

// Modern user dropdown combining authentication controls and notifications.

const props = defineProps({
  displayMode: {
    type: String as PropType<'default' | 'hamburger'>,
    default: 'default',
  },
})

const displayMode = computed(() => props.displayMode)

const { enableLogin } = useFeatureFlags()

const authStore = useAuthStore()
const { hasNotifications } = useNotifications()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const avatarUrl = computed(() => authStore.avatarUrl)
const userDisplayName = computed(() => authStore.user?.name || authStore.user?.login || 'GitHub User')
const userHandle = computed(() => `@${authStore.user?.login || 'github'}`)
const userInitials = computed(() => {
  const login = authStore.user?.login || ''
  return login.slice(0, 2).toUpperCase() || 'GH'
})

const isMobileMenuOpen = ref(false)

const openMobileMenu = () => {
  if (displayMode.value !== 'hamburger') return
  isMobileMenuOpen.value = true
}

const closeMobileMenu = () => {
  if (displayMode.value !== 'hamburger') return
  isMobileMenuOpen.value = false
}

const handleLogin = () => {
  void authStore.startLogin()
  closeMobileMenu()
}

const handleLogout = () => {
  authStore.logout()
  closeMobileMenu()
}

const hasNotificationBadge = computed(() => isLoggedIn.value && hasNotifications.value)

watch(displayMode, (mode) => {
  if (mode !== 'default') {
    // menu closes automatically when trigger unmounts in non-default mode
  }
})

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    // menu closes automatically when avatar disappears
  }
})
</script>

<style scoped>
.header-user-menu {
  display: flex;
  align-items: center;
}

.header-user-menu--hamburger {
  min-width: 0;
}

.header-user-menu-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.header-user-menu-trigger {
  min-width: 0;
  padding: 0;
}

.header-user-menu-dropdown {
  padding: 0;
  margin-top: 24px;
  z-index: 10;
  width: 100%;
  background-color: color-mix(in srgb, purple 95%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 0px 0px 3px 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.9);
  box-sizing: border-box;
}

.header-user-menu-content {
  width: 320px;
}

.header-user-menu__mobile-trigger {
  min-width: 0;
}

.header-user-menu__mobile-card {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--q-dark) 92%, transparent);
}

.header-user-menu__mobile-scroll {
  flex: 1;
}

.header-user-menu__mobile-content {
  flex: 1;
}

.header-user-menu__mobile-card {
  min-width: 599px;
}

.header-user-menu__mobile-dialog :deep(.q-dialog__backdrop) {
  background: rgba(0, 0, 0, 0.65);
}

@media (max-width: 599.98px) {
  .header-user-menu__mobile-card {
    min-width: 100px;
  }
}
</style>
