<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { fetchTopGameDetailsRequestMetrics } from 'src/services/gh-reports'
import type { GameDetailsRequestMetricResult } from '../../../shared/src/game'

export default defineComponent({
  components: {},
  props: {
    statSelection: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const listTitle = ref('')
    const gameDetailsRequests = ref([] as GameDetailsRequestMetricResult[])

    onMounted(async () => {
      if (!props.statSelection) {
        listTitle.value = ''
      } else if (props.statSelection == 'withReports') {
        gameDetailsRequests.value = await fetchTopGameDetailsRequestMetrics(7, 1, 99999)
        listTitle.value = 'Top 30 Game Details Requests For Games With Reports'
      } else if (props.statSelection == 'withoutReports') {
        gameDetailsRequests.value = await fetchTopGameDetailsRequestMetrics(7, 0, 0)
        listTitle.value = 'Top 30 Game Details Requests For Games Without Reports'
      }
    })

    return {
      listTitle,
      gameDetailsRequests
    }
  }
})
</script>

<template>
  <q-card class="text-white" style="background: radial-gradient(circle, #35a2ff 0%, var(--q-primary) 100%)">
    <q-card-section>
      <div class="text-h6">{{ listTitle }}</div>
      <div class="text-subtitle2"></div>
    </q-card-section>

    <q-card-section class="q-pt-none" :class="{ 'no-padding': $q.platform.is.mobile }">
      <div class="q-pa-md-md">
        <q-list padding>
          <q-item
            v-for="(game, index) in gameDetailsRequests"
            :key="index"
            clickable
            v-ripple
            :class="{ 'q-pl-md': $q.platform.is.mobile }"
            :to="game.app_id ? `/app/${game.app_id}` : game.game_name ? `/game/${encodeURIComponent(game.game_name)}` : ``"
          >
            <q-item-section top avatar class="q-pa-none q-pr-sm q-pr-sm-md">
              <div :style="$q.platform.is.mobile ? 'width: 80px;' : 'width: 100px;'">
                <q-img
                  v-if="game?.metadata?.poster"
                  class="game-poster"
                  :src="game?.metadata?.poster"
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
                  v-else-if="game.app_id"
                  class="game-poster"
                  :src="`https://steamcdn-a.akamaihd.net/steam/apps/${game.app_id}/library_600x900.jpg`"
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
            </q-item-section>

            <q-item-section top class="game-info-section">
              <q-item-label lines="1" class="text-h6 q-mb-xs">
                {{ game.game_name ? game.game_name : 'No Name Provided' }}
              </q-item-label>
              <q-item-label caption lines="2" class="q-pt-sm">
                <div class="row q-gutter-sm">
                  <div class="col-12">
                    <b>App ID: </b>{{ game.app_id !== null ? game.app_id : 'N/A' }}
                  </div>
                  <div class="col-12">
                    <b>Request Count: </b>{{ game.count }}
                  </div>
                  <div class="col-12">
                    <b>Report Count: </b>{{ game.report_count ?? 0 }}
                  </div>
                </div>
              </q-item-label>
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

.game-poster {
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: 3px 3px 10px black;
}
</style>
