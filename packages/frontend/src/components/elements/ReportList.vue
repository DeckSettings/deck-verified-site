<script setup lang="ts">
import DeviceImage from 'components/elements/DeviceImage.vue'
import type { HomeReport } from 'src/utils/api'
import type { PropType } from 'vue'

const props = defineProps({
  reportsList: {
    type: Array as PropType<HomeReport[]>,
    required: true,
  },
  editMode: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['edit-report'])

const getReviewScoreIcon = (reviewScore: string) => {
  switch (reviewScore) {
    case 'positive':
      return 'thumb_up'
    case 'neutral':
      return 'thumbs_up_down'
    case 'negative':
      return 'thumb_down'
    default:
      return ''
  }
}

const getReviewScoreColor = (reviewScore: string) => {
  switch (reviewScore) {
    case 'positive':
      return 'green'
    case 'neutral':
      return 'grey'
    case 'negative':
      return 'red'
    default:
      return 'grey'
  }
}

const getReviewScoreString = (reviewScore: string) => {
  switch (reviewScore) {
    case 'positive':
      return 'positively rated'
    case 'neutral':
      return 'neutral'
    case 'negative':
      return 'negatively rated'
    default:
      return 'grey'
  }
}

const getReviewScoreTooltip = (reviewScore: string) => {
  switch (reviewScore) {
    case 'positive':
      return 'Positively Reviewed'
    case 'neutral':
      return 'Neutrally Reviewed'
    case 'negative':
      return 'Negatively Reviewed'
    default:
      return ''
  }
}

/**
 * Filter labels that should be shown as chips in the user reports list
 * (only labels that start with the configured prefixes).
 */
const getFilteredLabels = (report: HomeReport) => {
  const prefixes = ['invalid:', 'note:', 'community:']
  const labels = report.issue?.labels
  if (!labels || !Array.isArray(labels)) return []

  // Map specific label names (lowercased) to human-friendly strings.
  const nameMap: Record<string, string> = {
    'invalid:report-inaccurate': 'Inaccurate',
    'invalid:template-incomplete': 'Incomplete',
    'note:ocr-generated-content': 'Unreviewed OCR Content',
    'community:clarification-requested': 'Community Clarification Requested',
    'community:config-review-suggested': 'Community Review Suggested',
    'community:improvements-suggested': 'Community Improvements Suggested',
    'community:spelling-check-suggested': 'Community Spell Check Suggested',
    'community:verification-suggested': 'Community Verification Suggested',
  }

  // Filter by prefixes and return transformed copies of the labels so we don't mutate originals.
  return labels
    .filter(l => {
      const name = (l.name || '').toLowerCase()
      return prefixes.some(p => name.startsWith(p))
    })
    .map(l => {
      const key = (l.name || '').toLowerCase()
      const mapped = nameMap[key]

      // Determine a simple icon based on the label prefix.
      // invalid: -> error, note: -> info, community: -> chat
      let icon = ''
      if (key.startsWith('invalid:')) {
        icon = 'bug_report'
      } else if (key.startsWith('note:')) {
        icon = 'info'
      } else if (key.startsWith('community:')) {
        icon = 'chat'
      }

      // Return a shallow copy with the mapped name and inferred icon (if any).
      return { ...l, name: mapped ? mapped : l.name, icon }
    })
}

const getReportUrl = (report: HomeReport) => {
  if (props.editMode) return ''
  const base = report.data.app_id
    ? `/app/${report.data.app_id}`
    : `/game/${encodeURIComponent(report.data.game_name)}`
  return report.id ? `${base}?expandedId=${report.id}` : base
}

const editReport = (report: HomeReport) => {
  if (report.issue?.number) {
    emit('edit-report', report.issue.number)
  }
}
</script>

<template>
  <div class="q-pa-md-md">
    <q-list padding>
      <q-item
        v-for="report in reportsList"
        :key="report.id ?? report.data.app_id ?? report.data.game_name"
        class="report-item"
        :class="{ 'q-pl-md': $q.platform.is.mobile }"
        :v-ripple="!editMode"
        :clickable="!editMode"
        :to="getReportUrl(report)"
      >
        <q-item-section top avatar class="q-pa-none q-pr-sm q-pr-sm-md">
          <div :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'">
            <q-img
              v-if="report.metadata.poster"
              class="game-poster"
              :src="report.metadata.poster"
              alt="Game Image"
              :ratio="2/3"
              :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'"
            >
              <template v-slot:error>
                <img
                  src="~/assets/poster-placeholder.png"
                  alt="Placeholder"
                  :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                />
              </template>
            </q-img>
            <q-img
              v-else-if="report.data.app_id"
              class="game-poster"
              :src="`https://steamcdn-a.akamaihd.net/steam/apps/${report.data.app_id}/library_600x900.jpg`"
              alt="Game Image"
              :ratio="2/3"
              :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'"
            >
              <template v-slot:error>
                <img
                  src="~/assets/poster-placeholder.png"
                  alt="Placeholder"
                  :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                />
              </template>
            </q-img>
            <img
              v-else
              class="game-poster"
              src="~/assets/poster-placeholder.png"
              alt="Placeholder"
              :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
            />
          </div>
          <q-item-label v-if="$q.platform.is.mobile"
                        class="absolute-bottom-left device-image-wrapper-mobile">
            <DeviceImage :device="report.data.device" :dropShadow="true" size="small" width="80px" />
          </q-item-label>
          <q-item-label v-else
                        class="absolute-bottom-left device-image-wrapper">
            <DeviceImage :device="report.data.device" :dropShadow="true" size="small" width="80px" />
          </q-item-label>
        </q-item-section>

        <q-item-section v-if="!$q.platform.is.mobile" top class="game-info-section">
          <q-item-label lines="1" class="lt-sm text-h6 ellipsis q-mb-xs" style="margin:0;">
            <span class="text-h6">{{ report.data.game_name }}</span>
            <br />
            <span class="text-caption text-weight-bold text-italic">"{{ report.data.summary }}"</span>
          </q-item-label>
          <q-item-label lines="1" class="gt-xs text-h6 ellipsis" style="margin:0;">
            <span class="text-h6">{{ report.data.game_name }}: </span>
            <span class="text-h6 text-weight-regular text-italic">"{{ report.data.summary }}"</span>
          </q-item-label>

          <q-item-label caption lines="2" class="q-pt-none">
            <div class="row q-gutter-sm">
              <!-- Text Details -->
              <div class="col-12">
                <b>Device: </b>{{ report.data.device }}
              </div>
              <div class="col-12">
                <b>Target Framerate: </b>{{ report.data.target_framerate }}
              </div>
              <div class="col-12">
                <b>Average Battery Life: </b>
                <template v-if="report.data.calculated_battery_life_minutes">
                  {{ Math.floor(report.data.calculated_battery_life_minutes / 60) }} hours
                  {{ report.data.calculated_battery_life_minutes % 60 }} mins
                </template>
                <template v-else>
                  unknown
                </template>
              </div>
              <div class="col-12">
                <b>Rating: </b>
                <template v-if="report.data.performance_rating && report.data.performance_rating !== 'Unrated'">
                  {{ report.data.performance_rating }}
                </template>
                <template v-else>
                  Not Rated
                </template>
              </div>
            </div>
          </q-item-label>
        </q-item-section>
        <q-item-section v-else top class="game-info-section">
          <q-item-label lines="1" class="lt-sm text-h6 ellipsis q-mb-xs" style="margin:0;">
            <span class="text-h6">{{ report.data.game_name }}</span>
            <br />
            <span class="text-caption text-weight-bold text-italic">"{{ report.data.summary }}"</span>
          </q-item-label>
          <q-item-label lines="1" class="gt-xs text-h6 ellipsis" style="margin:0;">
            <span class="text-h6">{{ report.data.game_name }}: </span>
            <span class="text-h6 text-weight-regular text-italic">"{{ report.data.summary }}"</span>
          </q-item-label>

          <q-item-label caption lines="2" class="q-pt-xs">
            <div class="row q-gutter-sm">
              <!-- Text Details -->
              <div class="col-12">
                <b>Device: </b>{{ report.data.device }}
              </div>
              <div class="col-12">
                <b>Target Framerate: </b>{{ report.data.target_framerate }}
              </div>
              <div class="col-12">
                <b>Average Battery Life: </b>
                <template v-if="report.data.calculated_battery_life_minutes">
                  {{ Math.floor(report.data.calculated_battery_life_minutes / 60) }} hours
                  {{ report.data.calculated_battery_life_minutes % 60 }} mins
                </template>
                <template v-else>
                  unknown
                </template>
              </div>
              <div class="col-12">
                <b>Rating: </b>
                <template v-if="report.data.performance_rating && report.data.performance_rating !== 'Unrated'">
                  {{ report.data.performance_rating }}
                </template>
                <template v-else>
                  Not Rated
                </template>
              </div>
            </div>
          </q-item-label>
        </q-item-section>

        <q-item-section side top class="report-item-section-chips">
          <template v-if="!editMode">
            <!-- User chip -->
            <q-chip
              class="report-item-user-chip"
              size="sm"
              color="brown"
              text-color="white">
              <q-avatar color="red" text-color="white">
                <img :src="report.user.avatar_url">
              </q-avatar>
              {{ report.user.login }}
            </q-chip>
          </template>

          <template v-if="editMode">
            <!-- Issue visibility chip -->
            <q-chip
              v-if="editMode"
              class="report-item-visibility-chip"
              size="sm"
              :color="report.issue?.state === 'open' ? 'positive' : 'negative'"
              text-color="white"
            >
              <q-avatar
                :icon="report.issue?.state === 'open' ? 'visibility' : 'visibility_off'"
                :color="report.issue?.state === 'open' ? 'positive' : 'negative'"
                text-color="white"
              />
              <span v-if="report.issue?.state">
                {{ report.issue?.state === 'open' ? 'Visible' : 'Closed' }}
              </span>
              <q-tooltip v-if="report.issue?.state" anchor="bottom middle" self="top middle">
                {{
                  report.issue?.state === 'open'
                    ? 'Open issue — visible in public reports'
                    : 'Closed issue — this report is closed and not visible to the public'
                }}
              </q-tooltip>
            </q-chip>

            <!-- Label chips (filtered prefixes) -->
            <div class="report-item-label-chips-wrapper">
              <q-chip
                class="report-item-label-chip"
                v-for="label in getFilteredLabels(report)" :key="label.id"
                size="sm"
                :style="{ 'background-color': `#${label.color}`, color: 'black' }"
              >
                <q-avatar v-if="label.icon" :icon="label.icon" text-color="white" color="black" />
                {{ label.name }}
                <q-tooltip anchor="top middle" self="bottom middle">
                  {{ label.description || '' }}
                </q-tooltip>
              </q-chip>
            </div>
          </template>

          <!--Review score chip -->
          <q-chip
            v-if="report.reviewScore === 'positive'"
            size="sm"
            :name="getReviewScoreIcon(report.reviewScore)"
            :color="getReviewScoreColor(report.reviewScore)">
            <q-avatar :icon="getReviewScoreIcon(report.reviewScore)"
                      :color="getReviewScoreColor(report.reviewScore)" text-color="white" />
            {{ getReviewScoreString(report.reviewScore) }}
            <q-tooltip v-if="report.reviewScore" anchor="center left" self="center right" :offset="[10, 10]">
              {{ getReviewScoreTooltip(report.reviewScore) }}
            </q-tooltip>
          </q-chip>
        </q-item-section>

        <q-item-section v-if="editMode" side top class="report-item-section-edit-button">
          <q-btn-dropdown
            flat dense rounded
            color="secondary"
            dropdown-icon="more_vert"
            :content-style="{
              minWidth: '100px',
              backgroundColor: 'color-mix(in srgb, var(--q-dark) 95%, transparent)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '0px 0px 3px 3px',
              boxShadow: '2px 2px 10px rgba(0, 0, 0, 0.9)',
            }"
          >
            <q-list>
              <q-item clickable v-close-popup @click="editReport(report)">
                <q-item-section avatar>
                  <q-avatar icon="edit" color="primary" text-color="white" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>Edit</q-item-label>
                </q-item-section>
              </q-item>
              <q-item clickable v-close-popup :href="report.issue?.html_url" target="_blank" rel="noopener">
                <q-item-section avatar>
                  <q-avatar icon="fab fa-github" color="primary" text-color="white" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>View Source</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </q-item-section>
      </q-item>

    </q-list>
  </div>
</template>

<style scoped>
.report-item {
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 12px;
  /*transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;*/
  border: 1px solid transparent;
}

.report-item:hover {
  background-color: color-mix(in srgb, var(--q-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--q-primary) 35%, transparent);
  transform: translateY(-1px);
}

.report-item-section-chips,
.report-item-section-edit-button {
  padding: 0;
}

.game-info-section {
  display: flex;
  flex-direction: column;
  height: 150px;
}

.game-poster {
  background-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.4);
  border-radius: 8px;
}

.device-image-wrapper {
  margin-left: 90px;
  margin-bottom: 2px;
}

.device-image-wrapper-mobile {
  margin-left: 4px;
  margin-bottom: 24px;
}

.report-item-label-chips-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-end;
  gap: 6px;
}

.report-item-label-chip {
  flex: 0 0 auto;
  margin: 2px 0;
  display: inline-flex;
}

@media (max-width: 599.99px) {
  .report-item {
    padding-bottom: 40px;
  }

  .report-item-visibility-chip {
    position: absolute;
    top: 0;
    left: 0;
  }

  .report-item-user-chip {
    position: absolute;
    bottom: -5px;
    left: 0;
  }

  .report-item-label-chips-wrapper {
    position: absolute;
    bottom: 3px;
    left: 8px;
    right: 8px;
    display: flex;
    flex-wrap: wrap-reverse;
    flex-direction: row-reverse;
    justify-content: flex-start;
    align-items: center;
    gap: 1px;
    pointer-events: none;
  }

  .report-item-label-chips-wrapper .report-item-label-chip {
    flex: 0 0 auto;
    margin: 0;
    pointer-events: auto;
  }

  .device-image-wrapper {
    margin-left: 2px;
    margin-bottom: 24px;
  }
}

@media (max-width: 1023.99px) {
  .game-info-section {
    height: inherit;
  }
}
</style>
