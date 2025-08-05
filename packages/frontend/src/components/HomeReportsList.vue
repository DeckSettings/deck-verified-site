<script lang="ts">
import { computed, defineComponent, onMounted } from 'vue'
import { useReportsStore } from 'src/services/gh-reports'
import DeviceImage from 'components/elements/DeviceImage.vue'


export default defineComponent({
  components: { DeviceImage },
  props: {
    reportSelection: {
      type: String,
      required: true,
    },
  },
  setup(props) {

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

    const reportStore = useReportsStore()
    const listTitle = computed(() =>
      props.reportSelection === 'popular'
        ? 'Most Popular Reports'
        : 'Recently Updated Reports',
    )
    const reportsList = computed(() =>
      props.reportSelection === 'popular'
        ? reportStore.popular
        : reportStore.recent,
    )

    onMounted(async () => {
      if (props.reportSelection == 'popular') {
        await reportStore.loadPopular()
      } else if (props.reportSelection == 'recentlyUpdated') {
        await reportStore.loadRecent()
      }
    })


    return {
      listTitle,
      reportsList,
      getReviewScoreIcon,
      getReviewScoreColor,
      getReviewScoreString,
      getReviewScoreTooltip,
    }
  },
})
</script>


<template>
  <q-card
    class="my-card text-white"
    style="background: radial-gradient(circle, #35a2ff 0%, var(--q-primary) 100%)">
    <q-card-section>
      <div class="text-h6">{{ listTitle }}</div>
      <div class="text-subtitle2"></div>
    </q-card-section>

    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile }">
      <div class="q-pa-md-md">
        <q-list padding>
          <q-item
            v-for="report in reportsList"
            :key="report.id"
            clickable
            v-ripple
            :class="{ 'q-pl-md': $q.platform.is.mobile }"
            :to="report.data.app_id ? `/app/${report.data.app_id}?expandedId=${report.id}` : `/game/${encodeURIComponent(report.data.game_name)}?expandedId=${report.id}`"
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
                            class="absolute-bottom-left q-ml-sm q-mb-lg">
                <DeviceImage :device="report.data.device" :shadow="true" />
              </q-item-label>
              <q-item-label v-else
                            class="absolute-bottom-left device-image">
                <DeviceImage :device="report.data.device" :shadow="true" />
              </q-item-label>
            </q-item-section>

            <q-item-section v-if="!$q.platform.is.mobile" top class="game-info-section">
              <q-item-label lines="1" class="text-h6 q-mb-xs">
                {{ report.data.game_name }}: <span style="font-weight:300;"> {{ report.data.summary }}</span>
              </q-item-label>
              <q-item-label caption lines="2" class="q-pt-sm">
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
                </div>
              </q-item-label>
            </q-item-section>
            <q-item-section v-else top class="game-info-section">
              <q-item-label lines="2" class="text-h6">
                {{ report.data.game_name }}
              </q-item-label>
              <q-item-label caption class="q-pt-sm">
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
                </div>
              </q-item-label>
            </q-item-section>

            <q-item-section v-if="!$q.platform.is.mobile" side top>
              <q-chip
                size="sm"
                color="brown"
                text-color="white">
                <q-avatar color="red" text-color="white">
                  <img :src="report.user.avatar_url">
                </q-avatar>
                {{ report.user.login }}
              </q-chip>
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

.device-image {
  margin-left: 90px;
  margin-bottom: 7px;
}

.game-poster {
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: 3px 3px 10px black;
}
</style>
