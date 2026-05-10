<template>
  <q-pull-to-refresh class="fit" no-mouse @refresh="handleRefresh">
    <q-page class="q-pa-md bg-grey-10 text-white">
      <div class="cards-container">
        <!-- WELCOME CARD -->
        <q-card v-if="showHomeWelcomeCard" flat bordered class="overflow-hidden">
          <div class="welcome-background" :style="{ backgroundImage: `url('${heroBackgroundImageUrl}')` }">
            <div class="welcome-content column text-white q-pa-md q-gutter-md">
              <!-- Caption -->
              <div class="text-h5 text-weight-bold">
                Welcome!
              </div>

              <!-- Description -->
              <div class="text-body2 text-grey-4">
                Discover community reports for Steam Deck, ROG Ally, Legion Go and other handheld consoles. Every report
                is part of an open-source database built by players like you. Browse, compare, and consider contributing
                your own to help the community grow.
              </div>

              <!-- Quick tips -->
              <div class="text-body2 text-grey-4">
                <div class="text-weight-bold">Tips:</div>

                <ul class="text-caption q-pl-md q-mt-xs q-mb-none">
                  <li>Use the search bar above to find a game.</li>
                  <li>On a game page, tap <strong>Submit report</strong> to share your settings.</li>
                  <li>Login with your GitHub profile above to access community features:
                    <ul class="q-pl-md q-mt-xs q-mb-none">
                      <li>Improved report form.</li>
                      <li>Manage your own reports from this app.</li>
                    </ul>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </q-card>

        <q-card
          v-if="showRecentGamesWidget"
          flat
          bordered
        >
          <div class="relative-position" style="overflow: hidden;">
            <div class="absolute-top-left feed-header-overlay row items-center q-gutter-sm">
              <q-avatar size="36px" color="primary" text-color="white" icon="new_releases" />
              <div class="text-subtitle2 text-weight-medium text-white">Newly Added Games</div>
            </div>

            <div
              v-if="homepageCardsLoading && recentGameCards.length === 0"
              class="row no-wrap">
              <q-card flat bordered class="bg-grey-8 text-grey-5 full-width full-height">
                <q-skeleton height="160px" width="100%" type="rect" animation="fade" />
                <div class="q-pa-md column q-gutter-sm">
                  <q-skeleton type="text" width="80%" animation="fade" />
                  <q-skeleton type="text" width="60%" animation="fade" />
                  <q-skeleton type="text" height="48px" animation="fade" />
                </div>
              </q-card>
            </div>

            <div v-else-if="recentGameCards.length === 0" class="bg-grey-8 text-grey-5 q-pa-lg column items-center">
              <q-icon name="new_releases" size="32px" class="q-mb-sm" />
              <div class="text-body2">No recently added games found. Try refreshing.</div>
            </div>

            <q-carousel
              v-else
              v-model="recentGamesCarouselModel"
              swipeable
              animated
              arrows
              class="bg-transparent rounded-borders"
              transition-prev="slide-right"
              transition-next="slide-left"
              control-type="regular"
              control-color="primary"
            >
              <q-carousel-slide
                v-for="(game, index) in recentGameCards"
                :key="`${game.appId ?? game.gameName}`"
                :name="index"
                class="flex flex-center q-pa-none"
                :img-src="getGameImage(game) ?? ''"
              >
                <div class="feed-slide-content">
                  <div class="feed-slide-link">
                    <q-btn
                      round
                      dense
                      color="primary"
                      icon="arrow_forward"
                      @click="openGame(game.appId, game.gameName)"
                    />
                  </div>
                  <div class="feed-slide-caption">
                    <div class="text-h6 text-weight-bold cursor-pointer" @click="openGame(game.appId, game.gameName)">
                      {{ index + 1 }}. {{ game.gameName }}
                    </div>
                    <div class="text-caption text-grey-4">
                      Added {{ formatDate(game.firstReportAt) }}
                    </div>
                    <div class="text-body2">
                      {{ game.reportCount }} reports
                      <span v-if="game.likes > 0">&nbsp;•&nbsp;{{ game.likes }} likes</span>
                    </div>
                  </div>
                </div>
              </q-carousel-slide>
            </q-carousel>
          </div>
        </q-card>

        <q-card
          v-if="showTopContributorsWidget"
          flat
          bordered
        >
          <div class="relative-position" style="overflow: hidden;">
            <div class="absolute-top-left feed-header-overlay row items-center q-gutter-sm">
              <q-avatar size="36px" color="amber-8" text-color="white" icon="workspace_premium" />
              <div class="text-subtitle2 text-weight-medium text-white">Top Contributors</div>
            </div>

            <div
              v-if="homepageCardsLoading && topContributorCards.length === 0"
              class="row no-wrap">
              <q-card flat bordered class="bg-grey-8 text-grey-5 full-width full-height">
                <q-skeleton height="160px" width="100%" type="rect" animation="fade" />
                <div class="q-pa-md column q-gutter-sm">
                  <q-skeleton type="text" width="80%" animation="fade" />
                  <q-skeleton type="text" width="60%" animation="fade" />
                  <q-skeleton type="text" height="48px" animation="fade" />
                </div>
              </q-card>
            </div>

            <div v-else-if="topContributorCards.length === 0" class="bg-grey-8 text-grey-5 q-pa-lg column items-center">
              <q-icon name="workspace_premium" size="32px" class="q-mb-sm" />
              <div class="text-body2">No contributor data found. Try refreshing.</div>
            </div>

            <q-carousel
              v-else
              v-model="topContributorsCarouselModel"
              swipeable
              animated
              arrows
              class="bg-transparent rounded-borders"
              transition-prev="slide-right"
              transition-next="slide-left"
              control-type="regular"
              control-color="primary"
            >
              <q-carousel-slide
                v-for="(contributor, index) in topContributorCards"
                :key="contributor.login"
                :name="index"
                class="flex flex-center q-pa-none contributor-slide"
                :img-src="getContributorImage(contributor) ?? ''"
              >
                <div class="contributor-slide__background" />
                <div class="feed-slide-content">
                  <div class="feed-slide-link">
                    <q-btn
                      round
                      dense
                      color="primary"
                      icon="arrow_forward"
                      @click="openContributor(contributor.login)"
                    />
                  </div>
                  <div class="feed-slide-caption">
                    <div class="row items-center no-wrap q-gutter-sm q-mb-sm">
                      <q-avatar size="48px">
                        <img v-if="contributor.avatar_url" :src="contributor.avatar_url" :alt="contributor.login"
                             loading="lazy" />
                        <span v-else>{{ contributor.login.slice(0, 2).toUpperCase() }}</span>
                      </q-avatar>
                      <div class="min-width-0">
                        <div class="text-h6 text-weight-bold cursor-pointer"
                             @click="openContributor(contributor.login)">
                          {{ index + 1 }}. @{{ contributor.login }}
                        </div>
                        <div class="text-caption text-grey-4">
                          {{ formatContributorDate(contributor) }}
                        </div>
                      </div>
                    </div>
                    <div class="text-body2">
                      {{ contributor.report_count }} reports • {{ contributor.games_covered }} games •
                      {{ contributor.likes_received }} likes
                    </div>
                  </div>
                </div>
              </q-carousel-slide>
            </q-carousel>
          </div>
        </q-card>

        <q-card
          v-if="showNewContributorsWidget"
          flat
          bordered
        >
          <div class="relative-position" style="overflow: hidden;">
            <div class="absolute-top-left feed-header-overlay row items-center q-gutter-sm">
              <q-avatar size="36px" color="positive" text-color="white" icon="celebration" />
              <div class="text-subtitle2 text-weight-medium text-white">New Contributors</div>
            </div>

            <div
              v-if="homepageCardsLoading && newContributorCards.length === 0"
              class="row no-wrap">
              <q-card flat bordered class="bg-grey-8 text-grey-5 full-width full-height">
                <q-skeleton height="160px" width="100%" type="rect" animation="fade" />
                <div class="q-pa-md column q-gutter-sm">
                  <q-skeleton type="text" width="80%" animation="fade" />
                  <q-skeleton type="text" width="60%" animation="fade" />
                  <q-skeleton type="text" height="48px" animation="fade" />
                </div>
              </q-card>
            </div>

            <div v-else-if="newContributorCards.length === 0" class="bg-grey-8 text-grey-5 q-pa-lg column items-center">
              <q-icon name="celebration" size="32px" class="q-mb-sm" />
              <div class="text-body2">No new contributor data found. Try refreshing.</div>
            </div>

            <q-carousel
              v-else
              v-model="newContributorsCarouselModel"
              swipeable
              animated
              arrows
              class="bg-transparent rounded-borders"
              transition-prev="slide-right"
              transition-next="slide-left"
              control-type="regular"
              control-color="primary"
            >
              <q-carousel-slide
                v-for="(contributor, index) in newContributorCards"
                :key="contributor.login"
                :name="index"
                class="flex flex-center q-pa-none contributor-slide contributor-slide--new"
                :img-src="getContributorImage(contributor) ?? ''"
              >
                <div class="contributor-slide__background" />
                <div class="feed-slide-content">
                  <div class="feed-slide-link">
                    <q-btn
                      round
                      dense
                      color="primary"
                      icon="arrow_forward"
                      @click="openContributor(contributor.login)"
                    />
                  </div>
                  <div class="feed-slide-caption">
                    <div class="row items-center no-wrap q-gutter-sm q-mb-sm">
                      <q-avatar size="48px">
                        <img v-if="contributor.avatar_url" :src="contributor.avatar_url" :alt="contributor.login"
                             loading="lazy" />
                        <span v-else>{{ contributor.login.slice(0, 2).toUpperCase() }}</span>
                      </q-avatar>
                      <div class="min-width-0">
                        <div class="text-h6 text-weight-bold cursor-pointer"
                             @click="openContributor(contributor.login)">
                          {{ index + 1 }}. @{{ contributor.login }}
                        </div>
                        <div class="text-caption text-grey-4">
                          {{ formatNewContributorDate(contributor) }}
                        </div>
                      </div>
                    </div>
                    <div class="text-body2">
                      {{ contributor.report_count }} reports • {{ contributor.devices_covered }} devices •
                      {{ contributor.likes_received }} likes
                    </div>
                  </div>
                </div>
              </q-carousel-slide>
            </q-carousel>
          </div>
        </q-card>

        <!-- FEED CARDS -->
        <q-card
          v-for="([feedKey, feed]) in feedEntries"
          :key="feedKey"
          flat
          bordered
        >
          <div class="relative-position" style="overflow: hidden;">
            <div class="absolute-top-left feed-header-overlay row items-center q-gutter-sm">
              <q-avatar v-if="feed.logo" size="36px">
                <img :src="feed.logo" :alt="`${feed.title} logo`" loading="lazy" />
              </q-avatar>
              <div class="text-subtitle2 text-weight-medium text-white">{{ feed.title }}</div>
            </div>

            <div
              v-if="shouldShowSkeleton(feed)"
              class="row no-wrap">
              <q-card flat bordered class="bg-grey-8 text-grey-5 full-width full-height">
                <q-skeleton height="160px" width="100%" type="rect" animation="fade" />
                <div class="q-pa-md column q-gutter-sm">
                  <q-skeleton type="text" width="80%" animation="fade" />
                  <q-skeleton type="text" width="60%" animation="fade" />
                  <q-skeleton type="text" height="48px" animation="fade" />
                </div>
              </q-card>
            </div>

            <div v-else-if="feed.items.length === 0" class="bg-grey-8 text-grey-5 q-pa-lg column items-center">
              <q-icon name="rss_feed" size="32px" class="q-mb-sm" />
              <div class="text-body2">No recent articles found. Try refreshing.</div>
            </div>

            <q-carousel
              v-else-if="feed.items.length"
              v-model="carouselModels[feedKey]"
              swipeable
              animated
              arrows
              class="bg-transparent rounded-borders"
              transition-prev="slide-right"
              transition-next="slide-left"
              control-type="regular"
              control-color="primary"
            >
              <q-carousel-slide
                v-for="(item, index) in feed.items"
                :key="item.link"
                :name="index"
                class="flex flex-center q-pa-none"
                :img-src="item.ogImage ?? ''"
              >
                <div class="feed-slide-content">
                  <div class="feed-slide-link">
                    <q-btn
                      round
                      dense
                      color="primary"
                      icon="open_in_new"
                      :href="item.link" target="_blank" rel="noopener"
                    />
                  </div>
                  <div class="feed-slide-caption">
                    <div class="text-h6 text-weight-bold cursor-pointer" @click="openWindow(item.link)">
                      {{ item.title }}
                    </div>
                    <div class="text-caption text-grey-4">
                      <span v-if="item.author">{{ item.author }}</span>
                      <span v-if="item.author && item.pubDate">&nbsp;•&nbsp;</span>
                      <span v-if="item.pubDate">
                        {{ formatRelative(item.pubDate) }} ({{ formatDate(item.pubDate) }})
                      </span>
                    </div>
                    <div class="text-body2">{{ truncate(item.description) }}</div>
                  </div>
                </div>
              </q-carousel-slide>
            </q-carousel>

            <q-inner-loading v-if="feed.isLoading && feed.hasLoadedOnce">
              <q-spinner size="32px" color="primary" />
            </q-inner-loading>

          </div>

          <q-banner v-if="feed.error" class="bg-negative text-white" dense>{{ feed.error }}</q-banner>
        </q-card>

        <q-card flat class="footer-card bg-transparent">
          <FooterSupportCard />
        </q-card>
      </div>
    </q-page>
  </q-pull-to-refresh>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useRssFeedStore } from 'src/stores/rss-feed-store'
import type { FeedDefinition } from 'src/stores/rss-feed-store'
import { useConfigStore } from 'src/stores/config-store'
import { useHomepageStore } from 'src/stores/homepage-store'
import type { HomepageRecentGame } from 'src/utils/api'
import { APP_FEEDS } from 'src/constants/feeds'
import FooterSupportCard from 'components/elements/FooterSupportCard.vue'

const baseUrl = ref((`${import.meta.env.BASE_URL ?? ''}`).replace(/^\/$/, '').replace(/\/$/, ''))
const heroBackgroundImageUrl = ref(`${baseUrl.value}/hero-image.png`)

dayjs.extend(relativeTime)

const router = useRouter()
const feedStore = useRssFeedStore()
const configStore = useConfigStore()
const homepageStore = useHomepageStore()
const { disabledFeeds, showHomeWelcomeCard, country } = storeToRefs(configStore)
const { recentGames, topContributors, newContributors } = storeToRefs(homepageStore)
const carouselModels = reactive<Record<string, number>>({})
const isMounted = ref(false)
const homepageCardsLoading = ref(false)
const MOBILE_RECENT_GAMES_LIMIT = 10
const MOBILE_TOP_CONTRIBUTORS_LIMIT = 10
const MOBILE_NEW_CONTRIBUTORS_LIMIT = 10
const recentGamesCarouselModel = ref(0)
const topContributorsCarouselModel = ref(0)
const newContributorsCarouselModel = ref(0)

const recentGameCards = computed(() => recentGames.value.slice(0, MOBILE_RECENT_GAMES_LIMIT))
const topContributorCards = computed(() => topContributors.value.slice(0, MOBILE_TOP_CONTRIBUTORS_LIMIT))
const newContributorCards = computed(() => newContributors.value.slice(0, MOBILE_NEW_CONTRIBUTORS_LIMIT))
const showRecentGamesWidget = computed(() => !disabledFeeds.value.includes('homepage-recent-games'))
const showTopContributorsWidget = computed(() => !disabledFeeds.value.includes('homepage-top-contributors'))
const showNewContributorsWidget = computed(() => !disabledFeeds.value.includes('homepage-new-contributors'))

const resolveFeedLogo = (logo: string | null | undefined) => {
  if (!logo) return null
  if (/^https?:\/\//i.test(logo)) return logo

  const normalizedPath = logo
    .replace(/^src\//, '../')
    .replace(/^[@~]\//, '../')

  try {
    return new URL(normalizedPath, import.meta.url).href
  } catch (error) {
    console.warn('[IndexMobilePage] Failed to resolve feed logo path', logo, error)
    return null
  }
}

const resolveFeedUrl = (url: string) => {
  return url.replace('{country}', country.value)
}

const enabledFeedDefinitions = computed(() =>
  APP_FEEDS
    .filter((feed): feed is typeof feed & { url: string } => typeof feed.url === 'string' && feed.url.length > 0)
    .filter(feed => !disabledFeeds.value.includes(feed.key))
    .map(feed => ({
      ...feed,
      url: resolveFeedUrl(feed.url),
      logo: resolveFeedLogo(feed.logo),
    })),
)

watch(
  enabledFeedDefinitions,
  (feeds, previous) => {
    const enabledKeys = new Set(feeds.map(feed => feed.key))

    feeds.forEach(({ key, url, title, subtitle, logo }) => {
      feedStore.registerFeed(key, url, {
        title,
        subtitle: subtitle ?? '',
        logo: logo ?? null,
      })
      if (carouselModels[key] === undefined) {
        carouselModels[key] = 0
      }
    })

    Object.keys(carouselModels).forEach((key) => {
      if (!enabledKeys.has(key)) {
        delete carouselModels[key]
      }
    })

    if (isMounted.value) {
      const previousList = previous ?? []
      const previousKeys = new Set(previousList.map(feed => feed.key))
      const newlyEnabled = feeds.filter(feed => !previousKeys.has(feed.key))
      if (newlyEnabled.length > 0) {
        void Promise.all(newlyEnabled.map(({ key }) => feedStore.ensureFeed(key)))
      }
    }
  },
  { immediate: true, deep: true },
)

const feedEntries = computed<[string, FeedDefinition][]>(() => enabledFeedDefinitions.value
  .map(({ key }) => {
    const feed = feedStore.feedByKey(key)
    return feed ? ([key, feed] as [string, FeedDefinition]) : null
  })
  .filter((entry): entry is [string, FeedDefinition] => entry !== null))


const loadHomepageCards = async (force = false) => {
  homepageCardsLoading.value = true
  try {
    await Promise.all([
      homepageStore.loadRecentGames(MOBILE_RECENT_GAMES_LIMIT, force),
      homepageStore.loadContributors(MOBILE_TOP_CONTRIBUTORS_LIMIT, MOBILE_NEW_CONTRIBUTORS_LIMIT, force),
    ])
  } finally {
    homepageCardsLoading.value = false
  }
}

onMounted(() => {
  isMounted.value = true
  void Promise.all([
    ...enabledFeedDefinitions.value.map(({ key }) => feedStore.ensureFeed(key)),
    loadHomepageCards(),
  ])
})

const formatDate = (iso?: string | null) => {
  if (!iso) return ''
  const parsed = dayjs(iso)
  return parsed.isValid() ? parsed.format('MMM D, YYYY') : ''
}

const formatRelative = (iso?: string | null) => {
  if (!iso) return ''
  const parsed = dayjs(iso)
  return parsed.isValid() ? parsed.fromNow() : ''
}

const formatContributorDate = (contributor: { last_report_at: string | null }) =>
  contributor.last_report_at ? `Last report ${formatDate(contributor.last_report_at)}` : 'No recent report date'

const formatNewContributorDate = (contributor: { first_report_at: string | null }) =>
  contributor.first_report_at ? `First report ${formatDate(contributor.first_report_at)}` : 'No first-report date'

const openWindow = (url?: string) => {
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
}

const gameRoute = (appId: number | null, gameName: string) => {
  if (appId) {
    return `/app/${appId}`
  }
  return `/game/${encodeURIComponent(gameName)}`
}

const openGame = (appId: number | null, gameName: string) => {
  void router.push(gameRoute(appId, gameName))
}

const openContributor = (login: string) => {
  void router.push({ name: 'public-user-reports', params: { login } })
}

const getGameImage = (game: HomepageRecentGame) =>
  game.metadata.poster || game.metadata.banner || game.metadata.hero || null

const getContributorImage = (contributor: {
  featured_game_metadata?: {
    poster?: string | null
    banner?: string | null
    hero?: string | null
  } | null
}) =>
  contributor.featured_game_metadata?.poster ||
  contributor.featured_game_metadata?.banner ||
  contributor.featured_game_metadata?.hero ||
  null

const handleRefresh = async (done: () => void) => {
  try {
    await Promise.all([
      ...feedEntries.value.map(([key]) => feedStore.ensureFeed(key, true)),
      loadHomepageCards(true),
    ])
  } finally {
    done()
  }
}

const isCarouselReady = (feed: FeedDefinition) =>
  feed.items.length > 0 && feed.items.every((item) => item.ogImageStatus !== 'idle' && item.ogImageStatus !== 'loading')

const shouldShowSkeleton = (feed: FeedDefinition) => {
  if (!feed.hasLoadedOnce) {
    if (feed.items.length === 0) {
      return true
    }
    return !isCarouselReady(feed)
  }

  return feed.items.length === 0 && feed.isLoading
}

const truncate = (text: string, limit = 150) => {
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

const ogFetchQueue = new Map<string, { key: string; link: string }>()
let ogFetchTimeout: number | null = null

const scheduleOgFetch = () => {
  if (!isMounted.value || ogFetchQueue.size === 0) return
  if (typeof window === 'undefined') return
  if (ogFetchTimeout !== null) return

  ogFetchTimeout = window.setTimeout(async () => {
    ogFetchTimeout = null
    const queueItems = Array.from(ogFetchQueue.values())
    ogFetchQueue.clear()

    for (const item of queueItems) {
      await feedStore.ensureOgImage(item.key, item.link)
    }
  }, 400)
}

onBeforeUnmount(() => {
  if (ogFetchTimeout !== null && typeof window !== 'undefined') {
    window.clearTimeout(ogFetchTimeout)
    ogFetchTimeout = null
  }
})

watch(feedEntries, (entries) => {
  entries.forEach(([key, feed]) => {
    const feedItems = feed.items
    if (feedItems.length === 0) {
      carouselModels[key] = 0
    } else if (carouselModels[key] === undefined || carouselModels[key] >= feedItems.length) {
      carouselModels[key] = 0
    }

    if (!isMounted.value) {
      return
    }

    feedItems.forEach((item) => {
      if (item.ogImageStatus === 'idle') {
        ogFetchQueue.set(`${key}-${item.link}`, { key, link: item.link })
      }
    })
  })

  scheduleOgFetch()
}, { deep: true })
</script>

<style scoped>
.welcome-background {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.welcome-content {
  background: color-mix(in srgb, var(--q-dark) 85%, transparent);
  backdrop-filter: blur(6px);
}

.feed-header-overlay {
  background: color-mix(in srgb, var(--q-dark) 75%, transparent);
  backdrop-filter: blur(6px);
  border-bottom-right-radius: 12px;
  color: white;
  z-index: 2;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.feed-slide-content {
  width: 100%;
  height: 100%;
  min-height: 260px;
  color: inherit;
  text-decoration: none;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding-top: 64px;
  box-sizing: border-box;
  position: relative;
}

.feed-slide-caption {
  width: 100%;
  padding: 16px;
  background: color-mix(in srgb, var(--q-dark) 75%, transparent);
  backdrop-filter: blur(6px);
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-slide-caption .text-body2 {
  color: rgba(255, 255, 255, 0.85);
}

.feed-slide-caption .text-caption {
  color: rgba(255, 255, 255, 0.7);
}

.feed-slide-link {
  position: absolute;
  top: 0;
  right: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  min-width: 52px;
  /*background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  border-bottom-left-radius: 12px;*/
  z-index: 3;
}

.rounded-borders :deep(.q-carousel__slide) {
  overflow: hidden;
}

.rounded-borders :deep(.q-carousel__control) {
  position: absolute;
  display: block;
  top: 100px;
}

.cards-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.contributor-slide {
  position: relative;
}

.contributor-slide__background {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top left, rgba(255, 205, 97, 0.22), transparent 35%),
  radial-gradient(circle at right center, rgba(255, 255, 255, 0.1), transparent 28%),
  linear-gradient(180deg, rgba(18, 24, 34, 0.85), rgba(8, 12, 18, 0.96));
}

.contributor-slide--new .contributor-slide__background {
  background: radial-gradient(circle at top left, rgba(88, 207, 158, 0.22), transparent 35%),
  radial-gradient(circle at right center, rgba(255, 255, 255, 0.1), transparent 28%),
  linear-gradient(180deg, rgba(16, 28, 24, 0.85), rgba(8, 12, 18, 0.96));
}

.min-width-0 {
  min-width: 0;
}

@media (orientation: landscape) and (min-width: 750px) {
  .cards-container {
    display: grid;
    gap: 24px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Consider forcing the first child to always be full width */
  /*.cards-container > :first-child {
    grid-column: 1 / -1;
  }*/
  .cards-container > .footer-card {
    grid-column: 1 / -1;
  }
}
</style>
