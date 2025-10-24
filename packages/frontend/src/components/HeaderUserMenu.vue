<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PropType } from 'vue'
import NotificationCenter from 'components/NotificationCenter.vue'
import { useAuthStore } from 'stores/auth-store'
import { useFeatureFlags } from 'src/composables/useFeatureFlags'
import { useNotifications } from 'src/composables/useNotifications'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import FooterSupportCard from 'components/elements/FooterSupportCard.vue'
import MobileProgressNotifications from 'components/elements/MobileProgressNotifications.vue'
import { mobileProgressState } from 'src/composables/useProgressNotifications'
import AppSettings from 'components/AppSettings.vue'

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
const { notifications, hasNotifications } = useNotifications()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const avatarUrl = computed(() => authStore.avatarUrl)
const userDisplayName = computed(() => authStore.user?.name || authStore.user?.login || 'GitHub User')
const userHandle = computed(() => `@${authStore.user?.login || 'github'}`)
const userInitials = computed(() => {
  const login = authStore.user?.login || ''
  return login.slice(0, 2).toUpperCase() || 'GH'
})

const hasProgress = computed(() => {
  return mobileProgressState.value && mobileProgressState.value.length > 0
})

const isMobileMenuOpen = ref(false)
const isSettingsDialogOpen = ref(false)

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

defineExpose({
  openMobileMenu,
})
</script>

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

          <!-- Progress badge -->
          <q-badge
            v-if="hasProgress && $q.platform.isMobileUi"
            class="header-progress-badge"
            color="transparent"
            floating rounded
          >
            <q-icon name="autorenew" color="warning" class="header-progress-icon" />
          </q-badge>

          <!-- Has notifications badge -->
          <q-badge
            v-if="isLoggedIn && hasNotifications"
            class="q-ml-sm"
            color="primary"
            text-color="white"
            floating
          >
            {{ notifications.length }}
          </q-badge>

          <q-menu
            anchor="bottom right"
            self="top right"
            :offset="$q.platform.isMobileUi ? [0, 13] : [0, 28]"
            :style="{
              width: $q.platform.isMobileUi ? '100%' : '420px',
              backgroundColor: 'color-mix(in srgb, var(--q-dark) 95%, transparent)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '0px 0px 3px 3px',
              boxShadow: '2px 2px 10px rgba(0, 0, 0, 0.9)',
              boxSizing: 'border-box',
            }"
            separate-close-popup
          >
            <div class="column q-pa-md q-gutter-md">
              <div class="row items-center no-wrap q-gutter-sm q-mb-md">
                <q-avatar size="44px">
                  <img v-if="avatarUrl" :src="avatarUrl" alt="GitHub avatar">
                  <span v-else>{{ userInitials }}</span>
                </q-avatar>
                <div class="column">
                  <span class="text-subtitle2">{{ userDisplayName }}</span>
                  <span class="text-caption text-grey-5">{{ userHandle }}</span>
                </div>

                <q-space />

                <q-separator vertical inset class="q-mr-sm" />

                <q-btn
                  outline
                  color="primary"
                  icon="logout"
                  label="Logout"
                  size="sm"
                  class="q-mt-none"
                  @click="handleLogout"
                />
              </div>

              <q-separator dark spaced />

              <template v-if="isLoggedIn">
                <q-list dark>
                  <q-item clickable v-ripple :to="{ name: 'user-reports' }">
                    <q-item-section avatar>
                      <q-avatar square color="primary" text-color="white" icon="description" />
                    </q-item-section>
                    <q-item-section>My Reports</q-item-section>
                    <q-item-section side>
                      <q-icon name="chevron_right" />
                    </q-item-section>
                  </q-item>
                  <q-item v-if="$q.platform.isMobileUi" clickable v-ripple @click="isSettingsDialogOpen = true">
                    <q-item-section avatar>
                      <q-avatar square color="primary" text-color="white" icon="settings" />
                    </q-item-section>
                    <q-item-section>App Settings</q-item-section>
                    <q-item-section side>
                      <q-icon name="chevron_right" />
                    </q-item-section>
                  </q-item>
                </q-list>

                <q-separator dark />

                <MobileProgressNotifications />
                <NotificationCenter />

                <q-separator dark spaced />
              </template>
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
        class="header-user-menu-dialog-trigger"
        aria-label="Open menu"
        @click="openMobileMenu"
      >
        <!-- Progress badge -->
        <q-badge
          v-if="hasProgress && $q.platform.isMobileUi"
          class="header-progress-badge"
          color="transparent"
          floating rounded
        >
          <q-icon name="autorenew" color="warning" class="header-progress-icon" />
        </q-badge>

        <!-- Has notifications badge -->
        <q-badge
          v-if="isLoggedIn && hasNotifications"
          class="q-ml-sm"
          color="primary"
          text-color="white"
          floating
        >
          {{ notifications.length }}
        </q-badge>
      </q-btn>

      <q-dialog
        v-model="isMobileMenuOpen"
        backdrop-filter="blur(2px)"
        maximized
        position="left"
        class="header-user-menu-dialog-dialog"
        transition-show="slide-right"
        transition-hide="slide-left"
      >
        <q-card
          class="dv-side-dialog-card"
          v-touch-swipe.touch.left="closeMobileMenu"
        >
          <q-card-section
            class="header-user-menu-dialog-header dv-side-dialog-header row items-center justify-between no-wrap">
            <div class="row items-center no-wrap q-gutter-sm">
              <q-avatar size="42px">
                <img v-if="isLoggedIn && avatarUrl" :src="avatarUrl" alt="GitHub avatar">
                <img v-else src="~/assets/icons/dv-app-icon.png" alt="DeckVerified Icon">
              </q-avatar>
              <div class="column">
                <span class="text-subtitle1 text-weight-medium">
                  {{ isLoggedIn ? userDisplayName : 'Deck Verified Games' }}
                </span>
                <span class="text-caption text-grey-5">
                  {{ isLoggedIn ? userHandle : 'Sign in to personalise' }}
                </span>
              </div>
            </div>
            <q-btn
              v-if="isLoggedIn"
              outline
              color="primary"
              icon="logout"
              label="Logout"
              size="sm"
              class="header-logout-button"
              @click="handleLogout"
            />
          </q-card-section>

          <q-separator dark />

          <q-scroll-area class="header-user-menu-dialog-scroll">
            <div class="header-user-menu-dialog-content column q-pa-md q-gutter-lg">
              <template v-if="isLoggedIn">
                <q-list dark>
                  <q-item clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          :to="{ name: 'user-reports' }"
                  >
                    <q-item-section avatar>
                      <q-avatar color="primary">
                        <q-icon name="description" />
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>My Reports</q-item-section>
                    <q-item-section side>
                      <q-icon name="chevron_right" />
                    </q-item-section>
                  </q-item>
                  <q-item v-if="$q.platform.isMobileUi" clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          @click="isSettingsDialogOpen = true"
                  >
                    <q-item-section avatar>
                      <q-avatar color="primary">
                        <q-icon name="settings" />
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>App Settings</q-item-section>
                    <q-item-section side>
                      <q-icon name="chevron_right" />
                    </q-item-section>
                  </q-item>
                </q-list>

                <q-separator dark class="q-my-md" />

                <MobileProgressNotifications />
                <NotificationCenter />
              </template>

              <template v-else>
                <q-list dark>
                  <q-item v-if="$q.platform.isMobileUi" clickable v-ripple
                          class="dv-dialog-menu-list-button"
                          @click="isSettingsDialogOpen = true"
                  >
                    <q-item-section avatar>
                      <q-avatar color="primary">
                        <q-icon name="settings" />
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>App Settings</q-item-section>
                    <q-item-section side>
                      <q-icon name="chevron_right" />
                    </q-item-section>
                  </q-item>
                </q-list>

                <q-separator dark />

                <div class="column q-gutter-sm">
                  <p class="text-body2 text-grey-4">
                    Connect your GitHub account to receive personalised notifications and save your activity.
                  </p>
                  <PrimaryButton
                    color="primary"
                    full-width
                    icon="fab fa-github"
                    label="Login with GitHub"
                    @click="handleLogin" />
                </div>
              </template>
            </div>
          </q-scroll-area>

          <q-separator dark class="q-my-md" />

          <div class="header-user-menu-dialog-footer">
            <FooterSupportCard v-if="$q.platform.isMobileUi" />
            <PrimaryButton
              color="primary"
              full-width
              icon="fas fa-times-circle"
              label="Close"
              class="footer-close-button"
              @click="closeMobileMenu"
            />
          </div>
        </q-card>
      </q-dialog>

      <!-- App Settings Dialog -->
      <q-dialog
        v-model="isSettingsDialogOpen"
        backdrop-filter="blur(2px)"
        maximized
        position="left"
        transition-show="slide-up"
        transition-hide="slide-down"
        transition-duration="100"
      >
        <q-card class="dv-side-dialog-card"
                :style="$q.screen.lt.sm ? 'min-width: 100vw;' : 'min-width: 600px;width: 600px;'"
        >
          <q-card-section class="dv-dialog-content">
            <AppSettings />
          </q-card-section>
        </q-card>
      </q-dialog>
    </template>
  </div>

</template>

<style scoped>
.header-user-menu {
  display: flex;
  align-items: center;
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

.header-user-menu-dialog-trigger {
  min-width: 0;
}

.header-progress-badge {
  transform: translate(-8px, 16px);
  z-index: 100;
}

.header-progress-icon {
  color: white;
  font-size: 20px;
  font-weight: bolder;
  display: inline-block;
  animation: header-progress-spin 1s linear infinite;
}

@keyframes header-progress-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.header-user-menu-dialog-scroll {
  flex: 1;
}

.header-user-menu-dialog-content {
  flex: 1;
}

.header-user-menu-dialog-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 16px;
}

.footer-close-button {
  display: none;
}

@media (max-width: 359.98px) {
  .header-user-menu-dialog-header {
    flex-wrap: wrap;
  }

  .header-logout-button {
    margin-top: 16px;
    width: 100%;
  }
}

@media (max-width: 280px) {
  .footer-close-button {
    display: inherit;
  }
}

.app-settings-dialog-card {
  min-height: 100vh;
}

.app-settings-dialog-scroll {
  height: 100%;
}
</style>
