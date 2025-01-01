<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { fetchRecentReports } from 'src/services/gh-reports'
import type { Report } from 'src/services/gh-reports'

export default defineComponent({
  setup() {
    const recentReports = ref([] as Report[])

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

    onMounted(async () => {
      recentReports.value = await fetchRecentReports()
    })

    return {
      recentReports,
      getReviewScoreIcon,
      getReviewScoreColor,
      getReviewScoreTooltip
    }
  }
})
</script>


<template>
  <q-card
    class="my-card text-white"
    style="background: radial-gradient(circle, #35a2ff 0%, var(--q-primary) 100%)">
    <q-card-section>
      <div class="text-h6">Recently Updated Reports</div>
      <div class="text-subtitle2"></div>
    </q-card-section>

    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile  }">
      <div class="q-pa-md-md">
        <q-list padding>
          <q-item
            v-for="report in recentReports"
            :key="report.id"
            clickable
            v-ripple
            :to="report.data.appid ? `/app/${report.data.appid}` : `/game/${encodeURIComponent(report.data.gameName)}`"
          >
            <q-item-section top avatar class="q-pa-none q-pr-sm q-pr-sm-md">
              <div :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'">
                <img
                  v-if="report.data.appid"
                  class="game-poster"
                  :src="`https://steamcdn-a.akamaihd.net/steam/apps/${report.data.appid}/library_600x900.jpg`"
                  alt="Game Image"
                  :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                />
                <img
                  v-else
                  class="game-poster"
                  src="~/assets/poster-placeholder.png"
                  alt="Placeholder"
                  :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                />
              </div>
            </q-item-section>

            <q-item-section v-if="!$q.platform.is.mobile" top class="game-info-section">
              <q-item-label class="text-h6">{{ report.data.gameName }}: {{ report.data.summary }}</q-item-label>
              <q-item-label caption class="q-pt-sm">
                <div><b>Target Framerate:</b> {{ report.data.targetFramerate }}</div>
                <div><b>Device:</b> {{ report.data.device }}</div>
                <div>
                  <b>Compatibility Tool Version:</b>
                  {{ report.data.compatibilityToolVersion }}
                </div>
              </q-item-label>
            </q-item-section>
            <q-item-section v-else top class="game-info-section">
              <q-item-label class="text-h6">{{ report.data.gameName }}</q-item-label>
              <q-item-label caption class="q-pt-sm">
                {{ report.data.summary }}
              </q-item-label>
              <q-item-label>
                <q-icon name="info"
                        :color="report.data.deckCompatibility === 'Verified'
                          ? 'green'
                          : report.data.deckCompatibility === 'Playable'
                          ? 'amber'
                          : 'red'">
                  <q-tooltip anchor="center left" self="center right" :offset="[10, 10]">
                    {{ report.data.deckCompatibility }}
                  </q-tooltip>
                </q-icon>

                <q-icon v-if="report.reviewScore"
                        :name="getReviewScoreIcon(report.reviewScore)"
                        :color="getReviewScoreColor(report.reviewScore)">
                  <q-tooltip v-if="report.reviewScore" anchor="center left" self="center right" :offset="[10, 10]">
                    {{ getReviewScoreTooltip(report.reviewScore) }}
                  </q-tooltip>
                </q-icon>
              </q-item-label>
            </q-item-section>

            <q-item-section v-if="!$q.platform.is.mobile" side top>
              <q-icon name="info"
                      :color="report.data.deckCompatibility === 'Verified'
                        ? 'green'
                        : report.data.deckCompatibility === 'Playable'
                        ? 'amber'
                        : 'red'">
                <q-tooltip anchor="center left" self="center right" :offset="[10, 10]">
                  {{ report.data.deckCompatibility }}
                </q-tooltip>
              </q-icon>

              <q-icon v-if="report.reviewScore"
                      :name="getReviewScoreIcon(report.reviewScore)"
                      :color="getReviewScoreColor(report.reviewScore)">
                <q-tooltip v-if="report.reviewScore" anchor="center left" self="center right" :offset="[10, 10]">
                  {{ getReviewScoreTooltip(report.reviewScore) }}
                </q-tooltip>
              </q-icon>
            </q-item-section>
          </q-item>

        </q-list>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.game-info-section {
  display: flex;
  flex-direction: column;
  height: 150px; /* Set a fixed height for the item section */
}

.report-details {
  margin-top: auto; /* Push the caption to the middle */
}
</style>
