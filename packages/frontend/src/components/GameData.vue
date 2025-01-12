<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { RouteParamsGeneric } from 'vue-router'
import { fetchGameData, fetchLabels } from 'src/services/gh-reports'
import { marked } from 'marked'
import type { GameReport, GameDetails, GitHubIssueLabel } from '../../../shared/src/game'

const route = useRoute()
const appId = ref<string | null>(null)
const gameName = ref<string | null>(null)
const gameData = ref<GameDetails | null>(null)
const gameBackground = ref<string | null>(null)
const gamePoster = ref<string | null>(null)
const gameBanner = ref<string | null>(null)
const githubProjectSearchLink = ref<string | null>(null)
const githubSubmitReportLink = ref<string>('https://github.com/DeckSettings/game-reports-steamos/issues/new?assignees=&labels=&projects=&template=GAME-REPORT.yml&title=%28Placeholder+-+Issue+title+will+be+automatically+populated+with+the+information+provided+below%29')

const selectedDevice = ref('all')
const deviceLabels = ref<GitHubIssueLabel[]>([])
const deviceOptions = computed(() => {
  if (deviceLabels.value) {
    const options = deviceLabels.value
      .map(label => ({
        label: label.description || label.name || 'Unknown',
        value: label.name
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })) // Case-insensitive sorting
    return [{ label: 'All', value: 'all' }, ...options]
  }
  // Default fallback to 'all' if no device lables are defined
  return [{ label: 'All', value: 'all' }]
})

const selectedLauncher = ref('all')
const launcherLabels = ref<GitHubIssueLabel[]>([])
const launcherOptions = computed(() => {
  if (launcherLabels.value) {
    let options = launcherLabels.value
      .map(label => ({
        label: label.description || label.name || 'Unknown',
        value: label.name
      }))
    // Separate out the 'launcher:other' option
    const otherOption = options.find(option => option.value === 'launcher:other')
    if (otherOption) {
      options = options.filter(option => option.value !== 'launcher:other')
    }
    // Sort options alphabetically (case-insensitive)
    options = options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    // Add the 'launcher:other' option back at the end
    if (otherOption) {
      options.push(otherOption)
    }
    // Include the 'All' option at the beginning
    return [{ label: 'All', value: 'all' }, ...options]
  }
  // Default fallback to 'all' if no launcher lables are defined
  return [{ label: 'All', value: 'all' }]
})

fetchLabels().then(labels => {
  deviceLabels.value = labels.filter(label => label.name.startsWith('device:'))
  launcherLabels.value = labels.filter(label => label.name.startsWith('launcher:'))
})

// Toggle function for sorting
const sortOption = ref('none')
const sortOrder = ref('off') // 'desc', 'asc', 'off'
const toggleSortOrder = (option: string) => {
  if (sortOption.value !== option) {
    sortOrder.value = 'desc'
    sortOption.value = option
    return
  }
  if (sortOrder.value === 'off') {
    sortOrder.value = 'desc'
  } else if (sortOrder.value === 'desc') {
    sortOrder.value = 'asc'
  } else {
    sortOrder.value = 'off'
  }
}


// Toggle show/hide logic for each report
const showIssueBody = ref<boolean[]>([])
const toggleConfigVisibility = (index: number) => {
  showIssueBody.value[index] = !showIssueBody.value[index]
}

const hasSystemConfig = (report: GameReport) => {
  return (
    report.data.undervolt_applied ||
    report.data.compatibility_tool_version ||
    report.data.custom_launch_options
  )
}

const hasPerformanceSettings = (report: GameReport) => {
  return (
    report.data.frame_limit ||
    report.data.allow_tearing ||
    report.data.half_rate_shading ||
    report.data.tdp_limit ||
    report.data.manual_gpu_clock ||
    report.data.scaling_mode ||
    report.data.scaling_filter
  )
}

// Generate a filtered/sorted list
const filteredReports = computed(() => {
  if (!gameData.value || !gameData.value.reports) {
    return []
  }

  let reports: GameReport[] = gameData.value.reports

  // Filter by device selector
  if (selectedDevice.value !== 'all' && selectedDevice.value) {
    reports = reports.filter(report => report.labels.some(label => label.name === selectedDevice.value))
  }
  // Filter by launcher selector
  if (selectedLauncher.value !== 'all' && selectedLauncher.value) {
    reports = reports.filter(report => report.labels.some(label => label.name === selectedLauncher.value))
  }

  if (sortOrder.value !== 'off') {
    if (sortOption.value === 'reactions') {
      reports = reports.sort((a, b) => {
        const aLikes = a.reactions['reactions_thumbs_up'] - a.reactions['reactions_thumbs_down']
        const bLikes = b.reactions['reactions_thumbs_up'] - b.reactions['reactions_thumbs_down']
        return sortOrder.value === 'asc' ? aLikes - bLikes : bLikes - aLikes // Ascending or descending
      })
    } else if (sortOption.value === 'updated') {
      reports = reports.sort((a, b) => {
        const aUpdated = new Date(a.updated_at).getTime()
        const bUpdated = new Date(b.updated_at).getTime()
        return sortOrder.value === 'asc' ? aUpdated - bUpdated : bUpdated - aUpdated // Ascending or descending
      })
    }
  }
  console.log(reports)

  return reports
})

const getCompatibilityIcon = (compatibility: string) => {
  switch (compatibility) {
    case 'Verified':
      return 'verified_user'
    case 'Playable':
      return 'warning'
    case 'Unsupported':
      return 'block'
    default:
      return ''
  }
}

const getCompatibilityColor = (compatibility: string) => {
  switch (compatibility) {
    case 'Verified':
      return 'green'
    case 'Playable':
      return 'orange'
    case 'Unsupported':
      return 'red'
    default:
      return 'grey'
  }
}

const initGameData = async (params: RouteParamsGeneric) => {
  if (route.path.startsWith('/app/')) {
    appId.value = params.appId as string
    gameData.value = await fetchGameData(null, appId.value)
  } else if (route.path.startsWith('/game/')) {
    gameName.value = decodeURIComponent(params.gameName as string)
    gameData.value = await fetchGameData(gameName.value, null)
  }
  // Fill in details from game data
  if (gameData.value) {
    if (gameData.value.gameName) {
      gameName.value = gameData.value.gameName
      githubSubmitReportLink.value = `${githubSubmitReportLink.value}&game_name=${encodeURIComponent(gameName.value)}`
    }
    if (gameData.value.projectNumber) {
      githubProjectSearchLink.value = `https://github.com/DeckSettings/game-reports-steamos/issues?q=is%3Aopen+is%3Aissue+project%3Adecksettings%2F${gameData.value.projectNumber}`
    }
    if (gameData.value.metadata) {
      console.log(gameData.value.metadata)
      gameBackground.value = gameData.value.metadata.hero
      gamePoster.value = gameData.value.metadata.poster
      // TODO: Add header image in place of poster image on larger screens
      gameBanner.value = gameData.value.metadata.banner
      githubSubmitReportLink.value = `${githubSubmitReportLink.value}&app_id=${appId.value}`
    }
  }
}

onMounted(async () => {
  await initGameData(route.params)
})

watch(
  () => route.params, // Watch route.params
  async (newParams) => {
    await initGameData(newParams)
  }
)
</script>

<template>
  <div class="background-container"
       :style="{ backgroundImage: `linear-gradient(to top, var(--q-dark), transparent), url('${gameBackground}')` }"></div>
  <div class="hero-container">
    <div class="hero row items-center q-pa-md-md q-pa-sm">
      <div class="col-xs-12 col-md-12 text-center q-pa-md">
        <div v-if="!$q.platform.is.mobile" class="game-title">
          {{ gameName }}
        </div>
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
        <div v-if="$q.platform.is.mobile" class="game-title">
          {{ gameName }}
        </div>
        <div class="q-pa-md">
          <div class="row justify-center">
            <q-btn class="q-ma-md" round flat icon="fab fa-github" :href="githubProjectSearchLink ?? ''" target="_blank"
                   color="white">
              <q-tooltip>View Reports on Github</q-tooltip>
            </q-btn>
            <q-btn v-if="appId" class="q-ma-md" round flat icon="fab fa-steam"
                   :href="`https://store.steampowered.com/app/${appId}`" target="_blank" color="white">
              <q-tooltip>View on Steam</q-tooltip>
            </q-btn>
            <q-btn v-if="appId" class="q-ma-md" round flat icon="fas fa-atom"
                   :href="`https://www.protondb.com/app/${appId}`" target="_blank" color="white">
              <q-tooltip>View on ProtonDB</q-tooltip>
            </q-btn>
            <q-btn v-if="gameName" class="q-ma-md" round flat icon="fas fa-file-invoice"
                   :href="githubSubmitReportLink"
                   target="_blank" color="white">
              <q-tooltip>Submit Report</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
      <div class="col-xs-12 col-md-8 q-pr-lg-sm q-pa-md-sm q-pa-xs-none self-start">
        <div class="game-data-container q-mr-lg-sm">
          <div v-if="gameData">
            <div v-if="gameData.reports === null || gameData.reports.length > 0">
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
                  v-for="(issue, index) in filteredReports" :key="index"
                  class="game-data-item q-px-sm q-py-sm q-px-sm-md q-py-sm-sm">
                  <q-item-section class="report">
                    <q-item-label class="q-mr-lg q-my-sm">
                      {{ issue.data.summary }}
                    </q-item-label>
                    <q-item-label caption class="q-mr-lg q-mb-sm">
                      <div class="row items-center">
                        <q-chip
                          v-if="issue.data.device_compatibility"
                          size="sm" square>
                          <q-avatar
                            :icon="getCompatibilityIcon(issue.data.device_compatibility)"
                            :color="getCompatibilityColor(issue.data.device_compatibility)"
                            text-color="white" />
                          {{ issue.data.device_compatibility }}
                        </q-chip>
                        <q-chip
                          v-if="issue.data.device"
                          size="sm" square>
                          <q-avatar color="blue" text-color="white">
                            <q-icon name="img:src/assets/icons/handheld.svg" color="white" />
                          </q-avatar>
                          {{ issue.data.device }}
                        </q-chip>
                        <!--<q-chip
                          v-if="issue.data.steam_play_compatibility_tool_used"
                          size="sm" square>
                          <q-avatar icon="gamepad" color="orange" text-color="white" />
                          {{ issue.data.steam_play_compatibility_tool_used }}:
                          {{ issue.data.compatibility_tool_version }}
                        </q-chip>-->
                        <q-chip
                          v-if="issue.data.target_framerate"
                          size="sm" square>
                          <q-avatar icon="speed" color="teal" text-color="white" />
                          Target FPS: {{ issue.data.target_framerate }}
                        </q-chip>
                        <q-chip
                          v-if="issue.data.launcher"
                          size="sm" square>
                          <q-avatar icon="rocket_launch" color="purple" text-color="white" />
                          Launcher: {{ issue.data.launcher }}
                        </q-chip>
                        <q-chip
                          v-if="issue.data.os_version"
                          size="sm" square>
                          <q-avatar icon="fab fa-steam" color="red" text-color="white" />
                          OS: {{ issue.data.os_version }}
                        </q-chip>
                      </div>
                    </q-item-label>

                    <!-- Toggle Button (Top Right) -->
                    <div class="top-right">
                      <q-btn
                        flat
                        round
                        dense
                        :icon="showIssueBody[index] ? 'expand_more' : 'chevron_right'"
                        :text-color="showIssueBody[index] ? 'primary' : 'white'"
                        @click="toggleConfigVisibility(index)"
                        :class="showIssueBody[index] ? 'rotate-down' : 'rotate-right'"
                      />
                    </div>

                    <!-- Config and Performance Cards -->
                    <transition name="expand">
                      <div v-show="showIssueBody[index]" class="game-config q-mt-md">
                        <div class="row q-col-gutter-md">
                          <!-- System Configuration Card -->
                          <div class="col-xs-12 col-md-6">
                            <q-card v-if="hasSystemConfig(issue)" class="config-card">
                              <q-card-section>
                                <div class="text-h6">System Configuration</div>
                              </q-card-section>
                              <q-separator />
                              <q-card-section class="q-pa-sm q-pa-sm-md">
                                <div class="config-list">
                                  <div v-if="issue.data.undervolt_applied" class="config-item">
                                    <span>Undervolt Applied:</span>
                                    <span>{{ issue.data.undervolt_applied }}</span>
                                  </div>
                                  <div
                                    v-if="issue.data.steam_play_compatibility_tool_used && issue.data.compatibility_tool_version"
                                    class="config-item">
                                    <span>Compatibility Tool:</span>
                                    <span>
                                    {{ issue.data.steam_play_compatibility_tool_used
                                      }}: {{ issue.data.compatibility_tool_version }}
                                  </span>
                                  </div>
                                  <div v-if="issue.data.custom_launch_options" class="config-item">
                                    <span>Launch Options:</span>
                                    <span>{{ issue.data.custom_launch_options }}</span>
                                  </div>
                                </div>
                              </q-card-section>
                            </q-card>
                          </div>
                          <!-- Performance Settings Card -->
                          <div class="col-xs-12 col-md-6">
                            <q-card v-if="hasPerformanceSettings(issue)" class="config-card">
                              <q-card-section>
                                <div class="text-h6">Performance Settings</div>
                              </q-card-section>
                              <q-separator />
                              <q-card-section class="q-pa-sm q-pa-sm-md">
                                <div class="config-list">
                                  <div v-if="issue.data.frame_limit" class="config-item">
                                    <span>Frame Limit:</span>
                                    <span>{{ issue.data.frame_limit }}</span>
                                  </div>
                                  <div v-if="issue.data.allow_tearing" class="config-item">
                                    <span>Allow Tearing:</span>
                                    <span>{{ issue.data.allow_tearing }}</span>
                                  </div>
                                  <div v-if="issue.data.half_rate_shading" class="config-item">
                                    <span>Half Rate Shading:</span>
                                    <span>{{ issue.data.half_rate_shading }}</span>
                                  </div>
                                  <div v-if="issue.data.tdp_limit" class="config-item">
                                    <span>TDP Limit:</span>
                                    <span>{{ issue.data.tdp_limit }}W</span>
                                  </div>
                                  <div v-if="issue.data.manual_gpu_clock" class="config-item">
                                    <span>Manual GPU Clock:</span>
                                    <span>{{ issue.data.manual_gpu_clock }}MHz</span>
                                  </div>
                                  <div v-if="issue.data.scaling_mode" class="config-item">
                                    <span>Scaling Mode:</span>
                                    <span>{{ issue.data.scaling_mode }}</span>
                                  </div>
                                  <div v-if="issue.data.scaling_filter" class="config-item">
                                    <span>Scaling Filter:</span>
                                    <span>{{ issue.data.scaling_filter }}</span>
                                  </div>
                                </div>
                              </q-card-section>
                            </q-card>
                          </div>
                        </div>
                        <div class="row q-ma-none q-pa-none">
                          <div class="col q-ma-none q-pa-none">
                            <q-card v-if="issue.data.game_display_settings"
                                    class="config-card q-mt-md q-ma-none q-pa-none">
                              <q-card-section>
                                <div class="text-h6">Game Display Settings</div>
                              </q-card-section>
                              <q-separator />
                              <q-card-section class="q-pa-sm q-pa-sm-md">
                                <div v-html="marked(issue.data.game_display_settings)"
                                     class="markdown q-ml-xs-none q-ml-md-sm"></div>
                              </q-card-section>
                            </q-card>
                            <q-card v-if="issue.data.game_graphics_settings"
                                    class="config-card q-mt-md q-ma-none q-pa-none">
                              <q-card-section>
                                <div class="text-h6">Game Graphics Settings</div>
                              </q-card-section>
                              <q-separator />
                              <q-card-section class="q-pa-sm q-pa-sm-md">
                                <div v-html="marked(issue.data.game_graphics_settings)"
                                     class="markdown q-ml-md-sm"></div>
                              </q-card-section>
                            </q-card>
                            <q-card v-if="issue.data.additional_notes" class="config-card q-mt-md q-ma-none q-pa-none">
                              <q-card-section>
                                <div class="text-h6">Additional Notes</div>
                              </q-card-section>
                              <q-separator />
                              <q-card-section class="q-pa-sm q-pa-sm-md">
                                <div v-html="marked(issue.data.additional_notes)" class="markdown q-ml-md-sm"></div>
                              </q-card-section>
                            </q-card>
                          </div>

                        </div>
                      </div>
                    </transition>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
            <div v-else class="no-reports-container">
              <div class="no-reports-card">
                <p class="text-center text-body1">No reports found for this game.</p>
                <p class="text-center text-body1">Would you like to be the first?</p>
                <div class="text-center q-mt-md">
                  <q-btn
                    class="full-width-sm"
                    icon="fab fa-github"
                    :href="githubSubmitReportLink"
                    target="_blank"
                    label="Submit a Report"
                    color="white"
                    text-color="black"
                    no-caps
                  />
                </div>
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
}

.hero-container {
  position: relative;
}

.game-title {
  font-size: 2.5em;
  font-weight: bold;
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

::v-deep(.report h1),
::v-deep(.report h2),
::v-deep(.report h3),
::v-deep(.report h4),
::v-deep(.report h5),
::v-deep(.report h6) {
  font-size: inherit;
  font-weight: bold;
}

::v-deep(.report h1) {
  font-size: 2rem;
}

::v-deep(.report h2) {
  font-size: 1.75rem;
}

::v-deep(.report h3) {
  font-size: 1.25rem;
}

::v-deep(.report h4) {
  font-size: 1rem;
}

::v-deep(.report h5) {
  font-size: 0.9rem;
}

::v-deep(.report h6) {
  font-size: 0.8rem;
}

::v-deep(.report p) {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

::v-deep(.markdown h1),
::v-deep(.markdown h2),
::v-deep(.markdown h3),
::v-deep(.markdown h4),
::v-deep(.markdown h5),
::v-deep(.markdown h6) {
  line-height: inherit;
}

/* Custom formatting for markdown lists */
::v-deep(.markdown ul) {
  list-style: none;
  padding: 0;
}

::v-deep(.markdown ul li) {
  padding: 12px 5px;
  display: flex;
  justify-content: space-between;
  text-align: right;
}

::v-deep(.markdown ul li strong) {
  display: block;
  text-align: left;
  margin-right: 5px;
  min-width: 60px;
}

::v-deep(.markdown ul li:not(:last-child)) {
  border-bottom: 1px solid #ddd;
}

/* -sm- */
@media (min-width: 600px) {
  .game-image-container {
    max-width: 400px;
  }

  .filter-select {
    width: 210px;
  }

  .config-card .config-item {
    padding: 12px 16px;
  }

  ::v-deep(.markdown ul li) {
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
