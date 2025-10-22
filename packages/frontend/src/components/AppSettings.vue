<template>
  <q-card flat bordered>
    <q-card-section class="side-dialog-header row items-center justify-between no-wrap">

      <div class="text-subtitle1 text-weight-bold">App Settings</div>
      <q-btn
        outline round
        color="primary"
        icon="close"
        size="sm"
        class="header-logout-button"
        v-close-popup
      />
    </q-card-section>

    <q-separator dark />

    <q-card-section class="q-gutter-lg">
      <section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Home Feeds</div>
        <q-list bordered dark class="rounded-borders">
          <q-item
            v-for="feed in feeds"
            :key="feed.key"
            class="text-white"
            clickable
            @click="toggleFeed(feed.key)"
          >
            <q-item-section avatar>
              <q-avatar v-if="feed.logo" size="32px">
                <img :src="feed.logo" :alt="`${feed.title} logo`" loading="lazy">
              </q-avatar>
              <q-icon v-else name="rss_feed" size="28px" color="primary" />
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-body1 text-weight-medium">
                {{ feed.title }}
              </q-item-label>
              <q-item-label v-if="feed.subtitle" caption class="text-grey-5">
                {{ feed.subtitle }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <q-toggle
                color="primary"
                :model-value="!configStore.isFeedDisabled(feed.key)"
                :disable="!isHydrated"
                @update:model-value="(value) => handleToggle(feed.key, value)"
                @click.stop
              />
            </q-item-section>
          </q-item>
        </q-list>
      </section>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from 'src/stores/config-store'
import { APP_FEEDS } from 'src/constants/feeds'

const configStore = useConfigStore()
const { isHydrated } = storeToRefs(configStore)

const handleToggle = (key: string, enabled: boolean) => {
  if (!isHydrated.value) return
  configStore.setFeedDisabled(key, !enabled)
}

const toggleFeed = (key: string) => {
  if (!isHydrated.value) return
  const isEnabled = !configStore.isFeedDisabled(key)
  handleToggle(key, !isEnabled)
}

const feeds = computed(() => APP_FEEDS)
</script>

<style scoped>

</style>
