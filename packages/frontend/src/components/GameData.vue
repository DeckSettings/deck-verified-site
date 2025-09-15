<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  simGithub,
  simSteam,
  simProtondb,
  simPcgamingwiki,
} from 'quasar-extras-svg-icons/simple-icons-v14'
import { useGameStore } from 'src/stores/game-store'
import { getPCGamingWikiUrlFromGameName } from 'src/services/external-links'
import type {
  GameReport,
  GameDetails,
  GitHubIssueLabel,
  GameReportData,
  ExternalGameReview,
} from '../../../shared/src/game'
import DeviceImage from 'components/elements/DeviceImage.vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ReportForm from 'components/ReportForm.vue'
import GameReportMarkdown from 'components/elements/GameReportMarkdown.vue'
import { useMeta } from 'quasar'

dayjs.extend(relativeTime)

interface ExtendedGameReport extends Omit<GameReport, 'data'> {
  data: Partial<GameReportData>;
  reportVisible?: boolean;
  external?: boolean;
}

const isClient = typeof window !== 'undefined'
const route = useRoute()
const gameStore = useGameStore()

// Load Pinia store state
const appId = computed<string | null>(() => gameStore.appId)
const gameName = computed<string>(() => gameStore.gameName)
const gameData = computed<GameDetails | null>(() => gameStore.gameData)

const highestRatedGameReport = computed<Partial<GameReportData> | null>(() => {
  const gd = gameData.value
  if (!gd || !gd.reports || gd.reports.length === 0) return null
  const internalOnly = gd.reports.slice().sort((a, b) => {
    const aLikes = a.reactions['reactions_thumbs_up'] - a.reactions['reactions_thumbs_down']
    const bLikes = b.reactions['reactions_thumbs_up'] - b.reactions['reactions_thumbs_down']
    return bLikes - aLikes
  })
  return internalOnly[0]?.data ?? null
})
const gameBackground = computed<string | null>(() => gameStore.gameBackground)
//const gamePoster = computed<string | null>(() => gameStore.gamePoster)
const gameBanner = computed<string | null>(() => gameStore.gameBanner)
const githubProjectSearchLink = computed<string | null>(() => gameStore.githubProjectSearchLink)
const githubSubmitReportLink = computed<string>(() => gameStore.githubSubmitReportLink)
const githubListReportsLink = ref<string>('https://github.com/DeckSettings/game-reports-steamos/issues?q=is%3Aopen+is%3Aissue+-label%3Ainvalid%3Atemplate-incomplete')

const useLocalReportForm = ref<boolean>(true)
const reportFormDialogOpen = ref<boolean>(false)
const dialogAutoOpened = ref(false)

const includeExternalReports = ref(route.query.includeExternalReports === 'true')
const sdhqLink = ref('')

const selectedDevice = ref('all')
const deviceLabels = computed<GitHubIssueLabel[]>(() => gameStore.deviceLabels)
const deviceOptions = computed(() => {
  if (deviceLabels.value) {
    const options = deviceLabels.value
      .map(label => ({
        label: label.description || label.name || 'Unknown',
        value: label.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return [{ label: 'All', value: 'all' }, ...options]
  }
  return [{ label: 'All', value: 'all' }]
})

const selectedLauncher = ref('all')
const launcherLabels = computed<GitHubIssueLabel[]>(() => gameStore.launcherLabels)
const launcherOptions = computed(() => {
  if (launcherLabels.value) {
    let options = launcherLabels.value.map(label => ({
      label: label.description || label.name || 'Unknown',
      value: label.name,
    }))
    const otherOption = options.find(option => option.value === 'launcher:other')
    if (otherOption) options = options.filter(option => option.value !== 'launcher:other')
    options = options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    if (otherOption) options.push(otherOption)
    return [{ label: 'All', value: 'all' }, ...options]
  }
  return [{ label: 'All', value: 'all' }]
})

const sortOption = ref<'none' | 'reactions' | 'updated'>('none')
const sortOrder = ref<'off' | 'asc' | 'desc'>('off')
const toggleSortOrder = (option: 'reactions' | 'updated') => {
  if (sortOption.value !== option) {
    sortOption.value = option
    sortOrder.value = 'desc'
    return
  }
  sortOrder.value = sortOrder.value === 'off' ? 'desc' : sortOrder.value === 'desc' ? 'asc' : 'off'
}

const hasSystemConfig = (report: ExtendedGameReport) => {
  return (
    report.data.undervolt_applied ||
    report.data.compatibility_tool_version ||
    report.data.game_resolution ||
    report.data.custom_launch_options
  )
}
const hasPerformanceSettings = (report: ExtendedGameReport) => {
  return (
    report.data.frame_limit ||
    report.data.disable_frame_limit ||
    report.data.enable_vrr ||
    report.data.allow_tearing ||
    report.data.half_rate_shading ||
    report.data.tdp_limit ||
    report.data.manual_gpu_clock ||
    report.data.scaling_mode ||
    report.data.scaling_filter
  )
}

const hasReports = computed(() => {
  if (!gameData.value) return false
  const internal = gameData.value.reports
  const hasInternal = internal === null || (Array.isArray(internal) && internal.length > 0)
  const hasExternal =
    includeExternalReports.value &&
    Array.isArray(gameData.value.external_reviews) &&
    gameData.value.external_reviews.length > 0
  return hasInternal || hasExternal
})

// Expanded state per-report id
const expanded = ref<Record<number, boolean>>({})

function isExpanded(id: number) {
  return !!expanded.value[id]
}

function setExpanded(id: number, val: boolean) {
  expanded.value[id] = val
}

/** SSR-stable, pure computed reports pipeline */
const filteredReports = computed<ExtendedGameReport[]>(() => {
  const gd = gameData.value
  if (!gd || !gd.reports) return []

  let reports: ExtendedGameReport[] = gd.reports.map((report) => ({
    ...report,
  }))

  // Filter by device selector
  if (selectedDevice.value !== 'all' && selectedDevice.value) {
    reports = reports.filter(report =>
      report.labels.some(label => label.name === selectedDevice.value),
    )
  }

  // Filter by launcher selector
  if (selectedLauncher.value !== 'all' && selectedLauncher.value) {
    reports = reports.filter(report =>
      report.labels.some(label => label.name === selectedLauncher.value),
    )
  }

  // Append any external reports
  if (Array.isArray(gd.external_reviews) && includeExternalReports.value) {
    gd.external_reviews.forEach((review: ExternalGameReview) => {
      if (review.source.name === 'SDHQ') {
        // This only sets a ref; safe for SSR
        sdhqLink.value = review.html_url
      }
      reports.push({
        id: review.id,
        number: 0,
        title: review.title,
        html_url: review.html_url,
        data: review.data as Partial<GameReportData>,
        user: {
          login: review.source.name,
          avatar_url: review.source.avatar_url,
          report_count: review.source.report_count || 0,
        },
        created_at: review.created_at,
        updated_at: review.updated_at,
        // Use metadata from parent game data
        metadata: {
          poster: gd.metadata.poster,
          hero: gd.metadata.hero,
          banner: gd.metadata.banner,
          background: gd.metadata.background,
        },
        reactions: { reactions_thumbs_up: 0, reactions_thumbs_down: 0 },
        labels: [],
        external: true,
      })
    })
  }

  // Sort logic
  if (sortOrder.value !== 'off') {
    if (sortOption.value === 'reactions') {
      reports = reports.slice().sort((a, b) => {
        const aLikes = a.reactions['reactions_thumbs_up'] - a.reactions['reactions_thumbs_down']
        const bLikes = b.reactions['reactions_thumbs_up'] - b.reactions['reactions_thumbs_down']
        return sortOrder.value === 'asc' ? aLikes - bLikes : bLikes - aLikes
      })
    } else if (sortOption.value === 'updated') {
      reports = reports.slice().sort((a, b) => {
        const aUpdated = new Date(a.updated_at).getTime()
        const bUpdated = new Date(b.updated_at).getTime()
        return sortOrder.value === 'asc' ? aUpdated - bUpdated : bUpdated - aUpdated
      })
    }
  }

  return reports
})

const lastUpdated = (dateString: string | null): string => {
  if (!dateString) return 'Unknown'
  const updatedAt = dayjs(dateString)
  return updatedAt.isValid() ? `${updatedAt.fromNow()}` : 'Unknown'
}

const openDialog = () => {
  // Dialog can render in SSR markup as closed; opening is client-only UX
  reportFormDialogOpen.value = true
  if (isClient && 'history' in window) {
    history.pushState({ dialog: true }, '')
  }
}
const closeDialog = () => {
  reportFormDialogOpen.value = false
  if (isClient && history.state && history.state.dialog) {
    history.back()
  }
}
const onPopState = () => {
  if (reportFormDialogOpen.value) closeDialog()
}

// Client-only effects
onMounted(async () => {
  if (isClient) {
    window.addEventListener('popstate', onPopState)

    // Auto-open dialog only on the client
    if (route.query.openReportForm === 'true' && !dialogAutoOpened.value) {
      dialogAutoOpened.value = true
      openDialog()
    }

    // Pre-expand a report from query param
    const expandedId = parseInt(route.query.expandedId as string, 10)
    if (!Number.isNaN(expandedId)) {
      expanded.value[expandedId] = true
    }
  }

  // Ensure data exists on first client render as well (SSR already fetched via onServerPrefetch)
  if (!gameData.value && typeof gameStore.ensureLoaded === 'function') {
    await gameStore.ensureLoaded(route)
  }
})
onBeforeUnmount(() => {
  if (isClient) {
    window.removeEventListener('popstate', onPopState)
  }
})

/*METADATA*/
const metaTitle = computed(() => gameStore.metadata.title || 'Game Report – Steam Deck settings')
const metaDescription = computed(() => gameStore.metadata.description || 'Best Steam Deck settings and community performance reports for this game. Graphics presets, frame rate targets, battery life tips, and tweaks that work on SteamOS handhelds.')
const metaLink = computed(() => `https://deckverified.games${route.path}`)
const metaLogo = ref('https://deckverified.games/logo2.png')
const metaImage = computed(() => gameStore.metadata.image)
const metaImageAlt = computed(() => gameStore.metadata.imageAlt)
const metaImageType = computed(() => gameStore.metadata.imageType)
const metaImageWidth = computed(() => gameStore.metadata.imageWidth)
const metaImageHeight = computed(() => gameStore.metadata.imageHeight)

// Watch for changes to the gameBanner URL and update store metadata
watch(gameBanner, (newUrl) => {
    if (newUrl) {
      gameStore.setMetadata({ image: newUrl, imageAlt: `${gameName.value} - Game Banner` })
      gameStore.updateImageMetadataFromUrl(newUrl)
    }
  },
  { immediate: true },
)

useMeta(() => {
  return {
    title: metaTitle.value,
    titleTemplate: title => `${title} - Deck Verified`,
    meta: {
      description: { name: 'description', content: metaDescription.value },
      keywords: {
        name: 'keywords',
        content: `${gameName.value}, Steam Deck, ROG Ally, performance, settings, compatibility, optimization`,
      },
      equiv: { 'http-equiv': 'Content-Type', content: 'text/html; charset=UTF-8' },

      // Open Graph (Facebook, Discord, etc.)
      ogTitle: { property: 'og:title', content: `${metaTitle.value} - Deck Verified` },
      ogType: { property: 'og:type', content: 'website' },
      ogImage: { property: 'og:image', content: metaImage.value },
      ogImageType: { property: 'og:image:type', content: metaImageType.value },
      ogImageAlt: { property: 'og:image:alt', content: metaImageAlt.value },
      ogImageWidth: { property: 'og:image:width', content: metaImageWidth.value },
      ogImageHeight: { property: 'og:image:height', content: metaImageHeight.value },
      ogUrl: { property: 'og:url', content: metaLink.value },
      ogDescription: { property: 'og:description', content: metaDescription.value },

      // Twitter Card (X)
      twitterCard: { name: 'twitter:card', content: 'summary_large_image' },
      twitterSite: { name: 'twitter:site', content: '@jsunnex' },
      twitterTitle: { name: 'twitter:title', content: `${metaTitle.value} - Deck Verified` },
      twitterDescription: { name: 'twitter:description', content: metaDescription.value },
      twitterImage: { name: 'twitter:image', content: metaImage.value },
    },

    link: { canonical: { rel: 'canonical', href: metaLink.value } },

    script: {
      ldJson: {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: gameName.value || 'Unknown Game',
          url: metaLink.value,
          image: metaImage.value || undefined,
          gamePlatform: ['Steam Deck'],
          operatingSystem: 'SteamOS',
          sameAs: appId.value ? [`https://store.steampowered.com/app/${appId.value}`] : undefined,
          publisher: {
            '@type': 'Organization',
            name: 'Deck Verified',
            logo: {
              '@type': 'ImageObject',
              'url': metaLogo.value,
            },
          },
        }),
      },
    },
  }
})
</script>

<template>
  <div class="background-container"
       :style="{ backgroundImage: `linear-gradient(to top, var(--q-dark), transparent), url('${gameBackground}')` }"></div>
  <div class="page-content-container">
    <div class="hero row items-center q-pa-md-md q-pa-sm">
      <div class="col-xs-12 col-md-12 text-center q-pa-md">
        <h1 v-if="!$q.platform.is.mobile" class="text-h2 game-title">
          {{ gameName }}
        </h1>
      </div>
      <div class="col-xs-12 col-md-4 text-center q-pa-md-sm q-pa-xs-none self-start game-links">
        <div class="game-image-container row justify-center">
          <q-img
            v-if="gameBanner"
            class="game-banner"
            :src="gameBanner"
            alt="Game Image">
            <template v-slot:error>
              <img
                src="~/assets/banner-placeholder.png"
                alt="Placeholder" />
            </template>
          </q-img>
          <q-img
            v-else
            class="game-banner"
            src="~/assets/banner-placeholder.png"
            alt="Game Image">
          </q-img>
        </div>
        <h1 v-if="$q.platform.is.mobile" class="text-h6 game-title">
          {{ gameName }}
        </h1>
        <div class="q-pa-md">
          <div class="row justify-center">
            <q-btn v-if="githubProjectSearchLink"
                   class="q-my-md"
                   round flat
                   :icon="simGithub"
                   :href="githubProjectSearchLink ?? ''"
                   target="_blank" rel="noopener"
                   color="white">
              <q-tooltip>View Reports on Github</q-tooltip>
            </q-btn>
            <q-btn v-if="appId"
                   class="q-my-md"
                   round flat
                   :icon="simSteam"
                   :href="`https://store.steampowered.com/app/${appId}`"
                   target="_blank" rel="noopener"
                   color="white">
              <q-tooltip>View on Steam</q-tooltip>
            </q-btn>
            <q-btn v-if="appId"
                   class="q-my-md"
                   round flat
                   :icon="simProtondb"
                   :href="`https://www.protondb.com/app/${appId}?device=steamDeck`"
                   target="_blank" rel="noopener"
                   color="white">
              <q-tooltip>View on ProtonDB</q-tooltip>
            </q-btn>
            <q-btn v-if="gameName"
                   class="q-my-md"
                   round flat
                   :icon="simPcgamingwiki"
                   :href="getPCGamingWikiUrlFromGameName(gameName)"
                   target="_blank" rel="noopener"
                   color="white">
              <q-tooltip>View on PCGamingWiki</q-tooltip>
            </q-btn>
            <q-btn v-if="sdhqLink"
                   class="q-my-md"
                   round flat
                   :href="sdhqLink"
                   target="_blank" rel="noopener"
                   color="white">
              <q-avatar size="42px">
                <img src="~/assets/icons/sdhq.svg">
              </q-avatar>
              <q-tooltip>View Game Review on SteamDeckHQ</q-tooltip>
            </q-btn>
          </div>
          <div class="row justify-center">
            <q-btn v-if="!useLocalReportForm" color="secondary" glossy
                   icon="fas fa-file-invoice"
                   label="Submit Report"
                   :href="githubSubmitReportLink"
                   target="_blank" rel="noopener" />
            <q-btn v-else color="secondary" glossy
                   icon="fas fa-file-invoice"
                   label="Submit Report"
                   @click="openDialog" />
            <q-dialog class="q-ma-none q-pa-none report-dialog"
                      full-height
                      :full-width="$q.screen.lt.md"
                      :maximized="$q.screen.lt.md"
                      v-model="reportFormDialogOpen"
                      @hide="closeDialog">
              <ReportForm :gameName="gameName"
                          :appId="appId ? appId : ''"
                          :gameBanner="gameBanner ? gameBanner : ''"
                          :gameBackground="gameBackground ? gameBackground : ''"
                          :previousSubmission="highestRatedGameReport? highestRatedGameReport : {}" />
            </q-dialog>
          </div>
        </div>
      </div>
      <div class="col-xs-12 col-md-8 q-pr-lg-sm q-pa-md-sm q-pa-xs-none self-start">
        <div class="game-data-container q-mr-lg-sm">
          <div v-if="gameData">
            <div v-if="hasReports">
              <div class="game-data-filters row q-mb-md justify-between items-center">
                <!-- Filters (Top Left) -->
                <div class="filters col-xs-12 col-md-8">
                  <q-select v-model="selectedDevice" label="Device"
                            dense outlined
                            class="filter-select q-my-xs-sm q-mr-xs"
                            :options="deviceOptions" emit-value map-options />
                  <q-select v-model="selectedLauncher" label="Launcher"
                            dense outlined
                            class="filter-select q-my-xs-sm q-ml-xs"
                            :options="launcherOptions" emit-value map-options />
                </div>

                <!-- Sorting (Top Right) -->
                <div class="sorting col-md-shrink" :class="$q.platform.is.mobile ? 'q-pt-md' : ''">
                  <!-- Sort by Updated -->
                  <q-btn dense round flat @click="toggleSortOrder('updated')"
                         :color="(sortOrder !== 'off' && sortOption === 'updated') ? 'primary' : 'white'">
                    <q-icon name="event" />
                    <q-icon
                      :name="(sortOrder === 'asc' && sortOption === 'updated') ? 'arrow_upward' : ((sortOrder === 'desc' && sortOption === 'updated') ? 'arrow_downward' : 'sort')"
                      :color="(sortOrder !== 'off' && sortOption === 'updated') ? 'primary' : 'white'" />
                    <q-tooltip>Sort by Last Updated</q-tooltip>
                  </q-btn>
                  <!-- Sort by Most Liked -->
                  <q-btn dense round flat @click="toggleSortOrder('reactions')"
                         :color="(sortOrder !== 'off' && sortOption === 'reactions') ? 'primary' : 'white'">
                    <q-icon name="thumb_up" />
                    <q-icon
                      :name="(sortOrder === 'asc' && sortOption === 'reactions') ? 'arrow_upward' : ((sortOrder === 'desc' && sortOption === 'reactions') ? 'arrow_downward' : 'sort')"
                      :color="(sortOrder !== 'off' && sortOption === 'reactions') ? 'primary' : 'white'" />
                    <q-tooltip v-if="sortOption !== 'reactions' || sortOrder === 'off'">
                      Sort by Most Liked
                    </q-tooltip>
                    <q-tooltip v-else-if="sortOrder === 'asc'">
                      Sorting by Most Liked Ascending
                    </q-tooltip>
                    <q-tooltip v-else-if="sortOrder === 'desc'">
                      Sorting by Most Liked Descending
                    </q-tooltip>
                  </q-btn>
                </div>
              </div>

              <q-list separator>
                <q-item
                  v-for="report in filteredReports" :key="report.id"
                  class="game-data-item q-mb-sm q-px-sm q-py-sm q-px-sm-md q-py-sm-sm">
                  <q-expansion-item :model-value="isExpanded(report.id)"
                                    @update:model-value="(v) => setExpanded(report.id, v)"
                                    dense class="full-width"
                                    expand-icon-class="self-end"
                                    header-class="full-width q-ma-none q-pa-none q-pa-sm-xs q-pb-sm-sm q-pb-xs-xs">
                    <template v-slot:header>
                      <q-item-section class="gt-xs">
                        <!-- Wrapper for the layout -->
                        <div class="row items-center q-gutter-sm">
                          <!-- Avatar Section -->
                          <div class="col-auto q-ml-md">
                            <q-avatar>
                              <DeviceImage :device="report.data.device ? report.data.device : ''" />
                            </q-avatar>
                          </div>
                          <!-- Report Summary Section -->
                          <div class="col q-ml-md">
                            <q-item-label class="text-h6 text-secondary">
                              {{ report.data.summary }}
                            </q-item-label>
                          </div>
                          <!-- Reporter-->
                          <div class="col-auto">
                            <q-item-label>
                              <q-chip size="sm"
                                      color="brown"
                                      text-color="white">
                                <q-avatar color="red" text-color="white">
                                  <img :src="report.user.avatar_url">
                                </q-avatar>
                                {{ report.user.login }}
                              </q-chip>
                            </q-item-label>
                          </div>
                        </div>
                        <!-- Report Description Section -->
                        <div class="row">
                          <div class="col-4">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Rating: </b>{{ report.data.performance_rating ?? 'Unrated' }}
                            </q-item-label>
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Device: </b>{{ report.data.device }}
                            </q-item-label>
                          </div>
                          <div class="col-4">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>OS: </b>{{ report.data.os_version }}
                            </q-item-label>
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Launcher: </b>{{ report.data.launcher }}
                            </q-item-label>
                          </div>
                          <div class="col-4">
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Target Framerate: </b>{{ report.data.target_framerate }}
                            </q-item-label>
                            <q-item-label caption lines="1" class="q-pt-sm">
                              <b>Average Battery Life: </b>
                              <template v-if="report.data.calculated_battery_life_minutes">
                                {{ Math.floor(report.data.calculated_battery_life_minutes / 60) }} hours
                                {{ report.data.calculated_battery_life_minutes % 60 }} mins
                              </template>
                              <template v-else>
                                unknown
                              </template>
                            </q-item-label>
                          </div>
                        </div>
                      </q-item-section>
                      <q-item-section class="lt-sm">
                        <!-- Wrapper for the layout -->
                        <div class="row items-center">
                          <!-- Avatar Section -->
                          <div class="col-auto">
                            <q-avatar>
                              <DeviceImage :device="report.data.device ? report.data.device : ''" />
                            </q-avatar>
                          </div>
                          <!-- Report Summary Section -->
                          <div class="col q-ml-md">
                            <q-item-label class="text-secondary">
                              {{ report.data.summary }}
                            </q-item-label>
                          </div>
                        </div>
                        <!-- Report Description Section -->
                        <div class="row q-pt-sm">
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>Device: </b>{{ report.data.device }}
                            </q-item-label>
                          </div>
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>OS: </b>{{ report.data.os_version }}
                            </q-item-label>
                            <q-item-label caption lines="1">
                              <b>Launcher: </b>{{ report.data.launcher }}
                            </q-item-label>
                          </div>
                          <div class="col-12 q-mt-xs">
                            <q-item-label caption lines="1">
                              <b>Target Framerate: </b>{{ report.data.target_framerate }}
                            </q-item-label>
                            <q-item-label caption lines="1">
                              <b>Average Battery Life: </b>
                              <template v-if="report.data.calculated_battery_life_minutes">
                                {{ Math.floor(report.data.calculated_battery_life_minutes / 60) }} hours
                                {{ report.data.calculated_battery_life_minutes % 60 }} mins
                              </template>
                              <template v-else>
                                unknown
                              </template>
                            </q-item-label>
                          </div>
                        </div>
                      </q-item-section>
                    </template>

                    <div class="report q-mt-md">
                      <div class="row q-col-gutter-md">
                        <!-- System Configuration Card -->
                        <div class="col-xs-12 col-md-6">
                          <q-card v-if="hasSystemConfig(report)" class="config-card">
                            <q-card-section>
                              <div class="text-h6">System Configuration</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div class="config-list">
                                <div v-if="report.data.undervolt_applied" class="config-item">
                                  <span>Undervolt Applied:</span>
                                  <span>{{ report.data.undervolt_applied }}</span>
                                </div>
                                <div
                                  v-if="report.data.steam_play_compatibility_tool_used && report.data.compatibility_tool_version"
                                  class="config-item">
                                  <span>Compatibility Tool:</span>
                                  <span>
                                    {{ report.data.steam_play_compatibility_tool_used
                                    }}: {{ report.data.compatibility_tool_version }}
                                  </span>
                                </div>
                                <div v-if="report.data.game_resolution" class="config-item">
                                  <span>Game Resolution:</span>
                                  <span>{{ report.data.game_resolution }}</span>
                                </div>
                                <div v-if="report.data.custom_launch_options" class="config-item">
                                  <span>Launch Options:</span>
                                  <span>{{ report.data.custom_launch_options }}</span>
                                </div>
                              </div>
                            </q-card-section>
                          </q-card>
                        </div>
                        <!-- Performance Settings Card -->
                        <div class="col-xs-12 col-md-6">
                          <q-card v-if="hasPerformanceSettings(report)" class="config-card">
                            <q-card-section>
                              <div class="text-h6">Performance Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div class="config-list">
                                <div v-if="report.data.frame_limit" class="config-item">
                                  <span v-if="report.data.disable_frame_limit === 'On'">Refresh Rate:</span>
                                  <span v-else>Frame Limit:</span>
                                  <span v-if="report.data.disable_frame_limit === 'On'">
                                    {{ report.data.frame_limit }}Hz
                                  </span>
                                  <span v-else>
                                    {{ report.data.frame_limit }}FPS
                                  </span>
                                </div>
                                <div v-if="report.data.disable_frame_limit" class="config-item">
                                  <span>Disable Frame Limit:</span>
                                  <span>{{ report.data.disable_frame_limit }}</span>
                                </div>
                                <div v-if="report.data.enable_vrr" class="config-item">
                                  <span>Enable VRR:</span>
                                  <span>{{ report.data.enable_vrr }}</span>
                                </div>
                                <div v-if="report.data.allow_tearing" class="config-item">
                                  <span>Allow Tearing:</span>
                                  <span>{{ report.data.allow_tearing }}</span>
                                </div>
                                <div v-if="report.data.half_rate_shading" class="config-item">
                                  <span>Half Rate Shading:</span>
                                  <span>{{ report.data.half_rate_shading }}</span>
                                </div>
                                <div v-if="report.data.tdp_limit" class="config-item">
                                  <span>TDP Limit:</span>
                                  <span>{{ report.data.tdp_limit }}W</span>
                                </div>
                                <div v-if="report.data.manual_gpu_clock" class="config-item">
                                  <span>Manual GPU Clock:</span>
                                  <span>{{ report.data.manual_gpu_clock }}MHz</span>
                                </div>
                                <div v-if="report.data.scaling_mode" class="config-item">
                                  <span>Scaling Mode:</span>
                                  <span>{{ report.data.scaling_mode }}</span>
                                </div>
                                <div v-if="report.data.scaling_filter" class="config-item">
                                  <span>Scaling Filter:</span>
                                  <span>{{ report.data.scaling_filter }}</span>
                                </div>
                              </div>
                            </q-card-section>
                          </q-card>
                        </div>
                      </div>
                      <div class="row q-ma-none q-pa-none">
                        <div class="col q-ma-none q-pa-none">
                          <q-card v-if="report.data.game_display_settings"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Game Display Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <GameReportMarkdown :markdown="report.data.game_display_settings" />
                            </q-card-section>
                          </q-card>
                          <q-card v-if="report.data.game_graphics_settings"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Game Graphics Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <GameReportMarkdown :markdown="report.data.game_graphics_settings" />
                            </q-card-section>
                          </q-card>
                          <q-card v-if="report.data.additional_notes"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Additional Notes</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <GameReportMarkdown :markdown="report.data.additional_notes" />
                            </q-card-section>
                          </q-card>
                        </div>
                      </div>
                      <div class="row items-center q-mt-lg q-mb-md q-pa-none">
                        <!-- Author Section -->
                        <div class="col-auto">
                          <q-item v-if="!report.external"
                                  :clickable="!report.external"
                                  v-ripple="!report.external"
                                  tag="a"
                                  :href="`${githubListReportsLink}+author%3A${report.user.login}` "
                                  target="_blank" rel="noopener"
                                  class="q-ma-none q-pa-none q-pl-xs">
                            <q-item-section side>
                              <q-avatar rounded size="48px">
                                <img :src="report.user.avatar_url" />
                              </q-avatar>
                            </q-item-section>
                            <q-item-section>
                              <q-item-label>{{ report.user.login }}</q-item-label>
                              <q-item-label caption>{{ report.user.report_count }} reports</q-item-label>
                            </q-item-section>
                          </q-item>
                          <q-item v-else
                                  class="q-ma-none q-pa-none q-pl-xs">
                            <q-item-section side>
                              <q-avatar rounded size="48px">
                                <img :src="report.user.avatar_url" />
                              </q-avatar>
                            </q-item-section>
                            <q-item-section>
                              <q-item-label>{{ report.user.login }}</q-item-label>
                              <q-item-label caption>{{ report.user.report_count }} reports</q-item-label>
                            </q-item-section>
                          </q-item>
                        </div>
                        <!-- Last Updated Section -->
                        <div class="col text-right">
                          <q-item class="q-ma-none q-pa-none q-pr-xs">
                            <q-item-section>
                              <q-item-label caption>
                                <a v-if="!report.external"
                                   :href="report.html_url" target="_blank" rel="noopener"
                                   style="text-decoration: none;">
                                  <q-chip square clickable class="q-ma-none q-pr-xs">
                                    <q-avatar icon="fab fa-github" text-color="white" />
                                    source
                                  </q-chip>
                                </a>
                                <a v-else
                                   :href="report.html_url" target="_blank" rel="noopener"
                                   style="text-decoration: none;">
                                  <q-chip square clickable class="q-ma-none q-pr-xs">
                                    <q-avatar text-color="white">
                                      <img :src="report.user.avatar_url">
                                    </q-avatar>
                                    source
                                  </q-chip>
                                </a>
                              </q-item-label>
                              <q-item-label caption class="q-pr-xs">
                                <b>Last updated:</b> {{ lastUpdated(report.updated_at) }}
                              </q-item-label>
                            </q-item-section>
                          </q-item>
                        </div>
                      </div>
                    </div>
                  </q-expansion-item>
                </q-item>
              </q-list>
            </div>
            <div v-else class="no-reports-container">
              <div class="no-reports-card">
                <p class="text-center text-body1">No reports found for this game.</p>
                <p class="text-center text-body1">Would you like to be the first?</p>
                <!--                <div class="text-center q-mt-md">
                                  <q-btn
                                    class="full-width-sm"
                                    icon="fab fa-github"
                                    :href="githubSubmitReportLink"
                                    target="_blank" rel="noopener"
                                    label="Submit a Report"
                                    color="white"
                                    text-color="black"
                                    no-caps
                                  />
                                </div>-->
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.background-container {
  background-size: cover;
  background-position: center;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 800px;
  z-index: 0;
}

.page-content-container {
  position: relative;
}

.game-title {
  margin-top: 0;
  margin-bottom: 15px;
  text-shadow: 2px 2px 4px black;
}

.game-image-container {
  max-width: 300px;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 20px;
  box-shadow: 5px 5px 10px black;
  overflow: hidden;
}

.game-banner {
  max-width: 100%;
  height: auto;
}

.filters {
  display: flex;
  align-items: center;
}

.filter-select {
  width: 100%;
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
}

.sorting {
  display: flex;
  align-items: center;
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 0 10px 5px 5px;
}

/* Report Body */
.top-right {
  position: absolute;
  top: 10px;
  right: 10px;
}

.no-reports-container {
  height: 400px;
}

.no-reports-card {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 50px 20px;
  text-align: center;
}

.game-data-item {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 10px
}

.config-card {
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
}

.config-card .config-list {
  display: flex;
  flex-direction: column;
}

.config-card .config-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 5px;
  border-bottom: 1px solid #ddd;
}

.config-card .config-item:last-child {
  border-bottom: none;
}

.config-card .config-item span:first-child {
  font-weight: bold;
  flex: 1;
}

.config-card .config-item span:last-child {
  text-align: right;
  min-width: 100px;
}

/* Rotate arrow when expanded */
.rotate-down {
  transform: rotate(0deg);
  transition: transform 0.3s ease;
}

.rotate-right {
  transform: rotate(-90deg);
  transition: transform 0.3s ease;
}

.game-config.hidden {
  display: none;
}

.game-config {
  transition: all 0.3s ease-in-out;
}

/* -sm- */
@media (min-width: 600px) {
  .background-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: /* Top fade */ linear-gradient(to bottom, transparent 20%, rgba(0, 0, 0, 0.6) 50%, var(--q-dark) 100%),
      /* Left fade */ linear-gradient(to right, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%),
      /* Right fade */ linear-gradient(to left, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%);
    mix-blend-mode: darken; /* Ensures darker areas blend naturally with the image */
    z-index: 1; /* Place it above the background image */
  }

  .game-image-container {
    max-width: 400px;
  }

  .filter-select {
    width: 210px;
  }

  .config-card .config-item {
    padding: 12px 16px;
  }
}

/* -md- */
@media (min-width: 1024px) {
  .game-links {
    position: sticky;
    top: 120px;
  }
}


/* -lg- */
@media (min-width: 1440px) {
  .game-image-container {
    max-width: 500px;
  }
}

/* -lg- */
@media (min-width: 1920px) {
  .game-image-container {
    max-width: 600px;
  }
}

</style>
