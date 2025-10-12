<template>
  <q-layout
    view="lHh lpr lFf"
    class="mobile-layout"
    :style="layoutStyle"
  >
    <div class="top-bar" ref="topBar">
      <div class="top-bar-inner">
        <HeaderUserMenu
          ref="headerUserMenu"
          v-if="enableLogin"
          display-mode="hamburger"
          class="header-hamburger"
        />
        <HeaderSearch class="top-bar-search" />
      </div>
    </div>

    <q-page-container :style="pageContainerStyle">
      <router-view />
    </q-page-container>

    <div class="bottom-nav" ref="bottomNav">
      <q-tabs
        v-model="activeTab"
        class="text-white small-tabs q-px-sm"
        active-color="primary"
        indicator-color="transparent"
        dense
        justify="between"
      >
        <q-route-tab name="home" icon="home" label="Home"
                     to="/" exact />
        <q-route-tab name="recent" icon="update" label="Recent"
                     :to="{ name: 'reports-page', params: { type: 'recentlyCreated' } }" exact />
        <q-route-tab name="popular" icon="thumb_up" label="Popular"
                     :to="{ name: 'reports-page', params: { type: 'popular' } }" exact />
        <q-route-tab name="views" icon="bar_chart" label="Views"
                     :to="{ name: 'reports-page', params: { type: 'views' } }" exact />
        <q-route-tab name="submit" icon="assignment_add" label="Submit"
                     to="/submit-report" exact />
      </q-tabs>
    </div>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute } from 'vue-router'
import HeaderSearch from 'components/HeaderSearch.vue'
import HeaderUserMenu from 'components/HeaderUserMenu.vue'
import { useFeatureFlags } from 'src/composables/useFeatureFlags'

const headerUserMenu = ref<InstanceType<typeof HeaderUserMenu> | null>(null)

const { enableLogin } = useFeatureFlags()
const route = useRoute()

const topBar = ref<HTMLElement | null>(null)
const bottomNav = ref<HTMLElement | null>(null)
const topBarHeight = ref(0)
const bottomNavHeight = ref(0)
const topBarOffset = computed(() => topBarHeight.value || 60)
const bottomNavOffset = computed(() => bottomNavHeight.value || 50)

provide('mobileTopBarHeight', topBarOffset)
provide('mobileBottomNavHeight', bottomNavOffset)

const activeTab = computed(() => {
  if (route.name === 'home') return 'home'
  if (route.name === 'reports-page' && route.params.type === 'recentlyCreated') return 'recentlyCreated'
  if (route.name === 'reports-page' && route.params.type === 'views') return 'views'
  if (route.name === 'reports-page' && route.params.type === 'popular') return 'popular'
  if (route.name === 'submit-report') return 'submit'
  return ''
})

onMounted(() => {
  if (topBar.value) {
    topBarHeight.value = topBar.value.offsetHeight
  }
  if (bottomNav.value) {
    bottomNavHeight.value = bottomNav.value.offsetHeight
  }
})

const pageContainerStyle = computed(() => ({
  paddingTop: `${topBarOffset.value}px`,
  paddingBottom: `${bottomNavOffset.value}px`,
}))

const layoutStyle = computed(() => ({
  '--mobile-top-bar-height': `${topBarOffset.value}px`,
  '--mobile-bottom-nav-height': `${bottomNavOffset.value}px`,
}))
</script>

<style scoped>
.mobile-layout {
  --safe-area-inset-top: env(safe-area-inset-top);
  --safe-area-inset-bottom: env(safe-area-inset-bottom);
  --top-bar-height: 60px;
  --bottom-nav-height: 50px;
}

.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1001;
  background: color-mix(in srgb, var(--q-dark) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding-top: var(--safe-area-inset-top);
  height: calc(var(--top-bar-height) + var(--safe-area-inset-top));
  border-bottom: 1px solid color-mix(in srgb, white 12%, transparent);
}

.top-bar-inner {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: var(--top-bar-height);
  gap: 16px;
}

.top-bar-search {
  flex-grow: 1;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1001;
  background: color-mix(in srgb, var(--q-dark) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding-bottom: var(--safe-area-inset-bottom);
  height: calc(var(--bottom-nav-height) + var(--safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, white 12%, transparent);
}

.q-tabs {
  height: var(--bottom-nav-height);
}

.small-tabs :deep(.q-tab) {
  min-height: 40px;
  padding: 0 8px;
}

.small-tabs :deep(.q-tabs__content) {
  justify-content: space-between;
}

.small-tabs :deep(.q-tab__icon) {
  font-size: 20px;
}

.small-tabs :deep(.q-tab__label) {
  font-size: 10px;
  margin-top: 4px;
}
</style>
