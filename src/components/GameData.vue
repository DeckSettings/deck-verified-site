<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { RouteParamsGeneric } from 'vue-router'
import { fetchGameData, fetchLabels, parseMarkdown } from 'src/services/gh-reports'
import type { GameData, GithubIssue, GithubIssueLabel, ReportData } from 'src/services/gh-reports'
import { marked } from 'marked'

interface ParsedReport extends GithubIssue {
  data: ReportData;
}

const route = useRoute()
const appId = ref<string | null>(null)
const gameName = ref<string | null>(null)
const gameData = ref<GameData | null>(null)
const parsedReports = ref<ParsedReport[]>([])
const gameBackground = ref<string | null>(null)
const gamePoster = ref<string | null>(null)
const gameBanner = ref<string | null>(null)
const githubProjectSearchLink = ref<string | null>(null)
const githubSubmitReportLink = ref<string>('https://github.com/DeckSettings/deck-settings-db/issues/new?assignees=&labels=&projects=&template=GAME-REPORT.yml&title=%28Placeholder+-+Issue+title+will+be+automatically+populated+with+the+information+provided+below%29')

const selectedDevice = ref('all')
const deviceLabels = ref<GithubIssueLabel[]>([])
const deviceOptions = computed(() => {
  if (deviceLabels.value) {
    const options = deviceLabels.value
      .filter(label => label.description)
      .map(label => ({ label: label.description, value: label.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return [{ label: 'All', value: 'all' }, ...options]
  }
  return [{ label: 'All', value: 'all' }]
})

const selectedLauncher = ref('all')
const launcherLabels = ref<GithubIssueLabel[]>([])
const launcherOptions = computed(() => {
  if (launcherLabels.value) {
    let options = launcherLabels.value
      .filter(label => label.description)
      .map(label => ({ label: label.description, value: label.name }))
    const otherOption = options.find(option => option.value === 'launcher:other')
    if (otherOption) {
      options = options.filter(option => option.value !== 'launcher:other')
    }
    options = options.sort((a, b) => a.label.localeCompare(b.label))
    if (otherOption) {
      options.push(otherOption)
    }
    return [{ label: 'All', value: 'all' }, ...options]
  }
  return [{ label: 'All', value: 'all' }]
})

fetchLabels().then(labels => {
  deviceLabels.value = labels.filter(label => label.name.startsWith('device:'))
  launcherLabels.value = labels.filter(label => label.name.startsWith('launcher:'))
})

// Toggle function for sorting
const sortOption = ref('none')
const sortOrder = ref('off') // 'asc', 'desc', 'off'
const toggleSortOrder = (option: string) => {
  if (sortOption.value !== option) {
    sortOrder.value = 'asc'
    sortOption.value = option
    return
  }
  if (sortOrder.value === 'off') {
    sortOrder.value = 'asc'
  } else if (sortOrder.value === 'asc') {
    sortOrder.value = 'desc'
  } else {
    sortOrder.value = 'off'
  }
}


// Toggle show/hide logic for each issue
const showIssueBody = ref<boolean[]>([])
const toggleConfigVisibility = (index: number) => {
  showIssueBody.value[index] = !showIssueBody.value[index]
}

const hasSystemConfig = (issue: ParsedReport) => {
  return (
    issue.data.undervoltApplied ||
    issue.data.compatibilityToolVersion ||
    issue.data.customLaunchOptions
  )
}

const hasPerformanceSettings = (issue: ParsedReport) => {
  return (
    issue.data.frameLimit ||
    issue.data.allowTearing ||
    issue.data.halfRateShading ||
    issue.data.tdpLimit ||
    issue.data.manualGpuClock ||
    issue.data.scalingMode ||
    issue.data.scalingFilter
  )
}

// Generate a filtered/sorted list
const filteredIssues = computed(() => {
  let issues: ParsedReport[] = parsedReports.value

  if (selectedDevice.value !== 'all' && selectedDevice.value) {
    issues = issues.filter(issue => issue.labels.some(label => label.name === selectedDevice.value))
  }

  if (selectedLauncher.value !== 'all' && selectedLauncher.value) {
    issues = issues.filter(issue => issue.labels.some(label => label.name === selectedLauncher.value))
  }

  if (sortOrder.value === 'reactions') {
    issues = issues.sort((a, b) => {
      const aLikes = a.reactions['reactions_thumbs_up'] - a.reactions['reactions_thumbs_down']
      const bLikes = b.reactions['reactions_thumbs_up'] - b.reactions['reactions_thumbs_down']
      return bLikes - aLikes // Sort by likes in descending order
    })
  } else {
    issues = issues.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) // Sort by last updated in descending order
  }

  return issues
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
      githubProjectSearchLink.value = `https://github.com/DeckSettings/deck-settings-db/issues?q=is%3Aopen+is%3Aissue+project%3Adecksettings%2F${gameData.value.projectNumber}`
    }
    if (gameData.value.metadata) {
      gameBackground.value = gameData.value.metadata.hero
      gamePoster.value = gameData.value.metadata.poster
      // TODO: Add header image in place of poster image on larger screens
      gameBanner.value = gameData.value.metadata.banner
      githubSubmitReportLink.value = `${githubSubmitReportLink.value}&app_id=${appId.value}`
    }
    // Parse the gameData issues
    parsedReports.value = gameData.value.reports.map(issue => ({
      ...issue,
      data: parseMarkdown(issue.body)
    }))
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
      <div class="col-xs-12 col-md-4 text-center q-pa-md-sm q-pa-xs-none self-start">
        <div class="game-poster-container">
          <img v-if="gamePoster" class="game-poster" :src="gamePoster" alt="Game Image">
          <img v-else class="game-poster" src="~/assets/poster-placeholder.png" alt="Placeholder">
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
      <div class="col-xs-12 col-md-8 q-pr-lg-sm q-pl-none-sm q-py-md-sm q-pa-xs-none self-start">
        <div class="game-data-container q-mr-lg-sm">
          <div v-if="gameData">
            <div class="game-data-filters row q-mb-md justify-between items-center">
              <!-- Filters (Top Left) -->
              <div class="filters row q-gutter-sm">
                <q-select v-model="selectedDevice" label="Device"
                          dense outlined
                          class="filter-select"
                          :options="deviceOptions" emit-value map-options />
                <q-select v-model="selectedLauncher" label="Launcher"
                          dense outlined
                          class="filter-select"
                          :options="launcherOptions" emit-value map-options />
              </div>

              <!-- Sorting (Top Right) -->
              <div class="sorting row q-gutter-sm " :class="$q.platform.is.mobile ? 'q-pt-md' : ''">
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
                  <q-tooltip>Sort by Most Liked</q-tooltip>
                </q-btn>
              </div>
            </div>

            <q-list separator>
              <q-item
                v-for="(issue, index) in filteredIssues" :key="index"
                class="game-data-item q-px-sm q-py-sm q-px-sm-md q-py-sm-sm">
                <q-item-section class="report">
                  <q-item-label class="q-mr-lg q-my-sm">
                    {{ issue.data.summary }}
                  </q-item-label>
                  <q-item-label caption class="q-mr-lg q-mb-sm">
                    <div class="row items-center">
                      <q-chip
                        v-if="issue.data.deckCompatibility"
                        size="sm" square>
                        <q-avatar
                          :icon="getCompatibilityIcon(issue.data.deckCompatibility)"
                          :color="getCompatibilityColor(issue.data.deckCompatibility)"
                          text-color="white" />
                        {{ issue.data.deckCompatibility }}
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
                        v-if="issue.data.compatibilityTool"
                        size="sm" square>
                        <q-avatar icon="gamepad" color="orange" text-color="white" />
                        {{ issue.data.compatibilityTool }}:
                        {{ issue.data.compatibilityToolVersion }}
                      </q-chip>-->
                      <q-chip
                        v-if="issue.data.targetFramerate"
                        size="sm" square>
                        <q-avatar icon="speed" color="teal" text-color="white" />
                        Target FPS: {{ issue.data.targetFramerate }}
                      </q-chip>
                      <q-chip
                        v-if="issue.data.launcher"
                        size="sm" square>
                        <q-avatar icon="rocket_launch" color="purple" text-color="white" />
                        Launcher: {{ issue.data.launcher }}
                      </q-chip>
                      <q-chip
                        v-if="issue.data.osVersion"
                        size="sm" square>
                        <q-avatar icon="fab fa-steam" color="red" text-color="white" />
                        OS: {{ issue.data.osVersion }}
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
                                <div v-if="issue.data.undervoltApplied" class="config-item">
                                  <span>Undervolt Applied:</span>
                                  <span>{{ issue.data.undervoltApplied }}</span>
                                </div>
                                <div v-if="issue.data.compatibilityTool && issue.data.compatibilityToolVersion"
                                     class="config-item">
                                  <span>Compatibility Tool:</span>
                                  <span>
                                    {{ issue.data.compatibilityTool }}: {{ issue.data.compatibilityToolVersion }}
                                  </span>
                                </div>
                                <div v-if="issue.data.customLaunchOptions" class="config-item">
                                  <span>Launch Options:</span>
                                  <span>{{ issue.data.customLaunchOptions }}</span>
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
                                <div v-if="issue.data.frameLimit" class="config-item">
                                  <span>Frame Limit:</span>
                                  <span>{{ issue.data.frameLimit }}</span>
                                </div>
                                <div v-if="issue.data.allowTearing" class="config-item">
                                  <span>Allow Tearing:</span>
                                  <span>{{ issue.data.allowTearing }}</span>
                                </div>
                                <div v-if="issue.data.halfRateShading" class="config-item">
                                  <span>Half Rate Shading:</span>
                                  <span>{{ issue.data.halfRateShading }}</span>
                                </div>
                                <div v-if="issue.data.tdpLimit" class="config-item">
                                  <span>TDP Limit:</span>
                                  <span>{{ issue.data.tdpLimit }}W</span>
                                </div>
                                <div v-if="issue.data.manualGpuClock" class="config-item">
                                  <span>Manual GPU Clock:</span>
                                  <span>{{ issue.data.manualGpuClock }}MHz</span>
                                </div>
                                <div v-if="issue.data.scalingMode" class="config-item">
                                  <span>Scaling Mode:</span>
                                  <span>{{ issue.data.scalingMode }}</span>
                                </div>
                                <div v-if="issue.data.scalingFilter" class="config-item">
                                  <span>Scaling Filter:</span>
                                  <span>{{ issue.data.scalingFilter }}</span>
                                </div>
                              </div>
                            </q-card-section>
                          </q-card>
                        </div>
                      </div>
                      <div class="row q-ma-none q-pa-none">
                        <div class="col q-ma-none q-pa-none">
                          <q-card v-if="issue.data.gameDisplaySettings" class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Game Display Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div v-html="marked(issue.data.gameDisplaySettings)"
                                   class="markdown q-ml-xs-none q-ml-md-sm"></div>
                            </q-card-section>
                          </q-card>
                          <q-card v-if="issue.data.gameGraphicsSettings"
                                  class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Game Graphics Settings</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div v-html="marked(issue.data.gameGraphicsSettings)" class="markdown q-ml-md-sm"></div>
                            </q-card-section>
                          </q-card>
                          <q-card v-if="issue.data.additionalNotes" class="config-card q-mt-md q-ma-none q-pa-none">
                            <q-card-section>
                              <div class="text-h6">Additional Notes</div>
                            </q-card-section>
                            <q-separator />
                            <q-card-section class="q-pa-sm q-pa-sm-md">
                              <div v-html="marked(issue.data.additionalNotes)" class="markdown q-ml-md-sm"></div>
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
  position: relative; /* Ensure hero content is positioned relative to this container */
}

.game-title {
  font-size: 2.5em;
  font-weight: bold;
  margin-bottom: 15px;
  text-shadow: 2px 2px 4px black;
}

.game-poster-container {
  width: 200px;
  overflow: hidden;
  margin-bottom: 20px;
  box-shadow: 5px 5px 10px black;
  display: flex; /* Center the poster */
  justify-content: center; /* Center the poster */
  margin-left: auto; /* Center the poster */
  margin-right: auto; /* Center the poster */
}

.game-poster {
  width: 100%;
  height: auto; /* Maintain aspect ratio */
  object-fit: contain; /* Ensure the entire image is visible */
}

.filter-select {
  width: 100%;
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
}

.filters {
  display: flex;
  align-items: center;
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

@media (min-width: 600px) {
  .filter-select {
    width: 250px;
  }

  .config-card .config-item {
    padding: 12px 16px;
  }

  ::v-deep(.markdown ul li) {
    padding: 12px 16px;
  }
}

</style>
