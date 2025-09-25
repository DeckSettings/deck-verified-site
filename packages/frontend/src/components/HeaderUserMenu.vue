<template>
  <div
    v-if="enableLogin"
    class="header-user-menu"
    :class="`header-user-menu--${displayMode}`"
  >
    <template v-if="displayMode === 'default'">
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

      <q-btn-dropdown
        v-else
        flat
        dense
        no-caps
        color="white"
        class="header-user-menu__dropdown"
        menu-anchor="bottom end"
        menu-self="top end"
        content-class="header-user-menu__menu bg-dark text-white"
      >
        <template #label>
          <div class="header-user-menu__avatar">
            <q-avatar size="28px">
              <img v-if="avatarUrl" :src="avatarUrl" alt="GitHub avatar">
              <span v-else>{{ userInitials }}</span>
            </q-avatar>
          </div>
        </template>

        <q-list dense>
          <q-item clickable v-close-popup @click="handleLogout">
            <q-item-section>Logout</q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </template>

    <q-btn-dropdown
      v-else
      flat
      dense
      no-caps
      color="white"
      icon="menu"
      class="header-user-menu__dropdown"
      menu-anchor="bottom right"
      menu-self="top right"
      content-class="header-user-menu__menu bg-dark text-white"
    >
      <q-list dense>
        <template v-if="!isLoggedIn">
          <q-item clickable v-close-popup @click="handleLogin">
            <q-item-section>Login</q-item-section>
          </q-item>
        </template>
        <template v-else>
          <q-item clickable v-close-popup @click="handleLogout">
            <q-item-section>Logout</q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-btn-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useAuthStore } from 'stores/auth-store'
import { useFeatureFlags } from 'src/composables/useFeatureFlags'

const props = defineProps({
  displayMode: {
    type: String as PropType<'default' | 'hamburger'>,
    default: 'default',
  },
})

const displayMode = computed(() => props.displayMode)

const { enableLogin } = useFeatureFlags()

const authStore = useAuthStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const avatarUrl = computed(() => authStore.avatarUrl)
const userInitials = computed(() => {
  const login = authStore.user?.login || ''
  return login.slice(0, 2).toUpperCase() || 'GH'
})

const handleLogin = () => {
  void authStore.startLogin()
}

const handleLogout = () => {
  authStore.logout()
}
</script>

<style scoped>
.header-user-menu {
  display: flex;
  align-items: center;
}

.header-user-menu--hamburger {
  min-width: 0;
}

.header-user-menu__dropdown {
  padding: 0;
}

.header-user-menu__menu {
  min-width: 160px;
}

.header-user-menu__menu :deep(.q-item) {
  color: white;
}
</style>
