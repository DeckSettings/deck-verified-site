<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useHomepageStore } from 'src/stores/homepage-store'
import type { ContributorSummary } from 'src/utils/api'
import { QAjaxBar } from 'quasar'

const homepageStore = useHomepageStore()
const { topContributors, newContributors } = storeToRefs(homepageStore)
const ajaxBar = ref<QAjaxBar | null>(null)

interface SpotlightPanel {
  key: string
  title: string
  description: string
  icon: string
  accentClass: string
  emptyText: string
  contributors: ContributorSummary[]
  chips: (contributor: ContributorSummary) => string[]
  footnote: (contributor: ContributorSummary) => string
}

const panels = computed<SpotlightPanel[]>(() => ([
  {
    key: 'top',
    title: 'Top Contributors',
    description: 'Four standout community members who have pushed the most report volume and quality signal across the archive.',
    icon: 'workspace_premium',
    accentClass: 'spotlight-panel--top',
    emptyText: 'No contributor data is available yet.',
    contributors: topContributors.value,
    chips: (contributor: ContributorSummary) => [
      `${contributor.report_count} reports`,
      `${contributor.games_covered} games`,
      `${contributor.likes_received} likes`,
    ],
    footnote: (contributor: ContributorSummary) =>
      contributor.last_report_at ? `Last report ${formatDate(contributor.last_report_at)}` : 'No recent report date',
  },
  {
    key: 'new',
    title: 'Recent First-Time Contributors',
    description: 'Four of the newest contributors to publish their first report and start building community trust.',
    icon: 'celebration',
    accentClass: 'spotlight-panel--new',
    emptyText: 'No contributor data is available yet.',
    contributors: newContributors.value,
    chips: (contributor: ContributorSummary) => [
      `${contributor.report_count} reports`,
      `${contributor.devices_covered} devices`,
      `${contributor.likes_received} likes`,
    ],
    footnote: (contributor: ContributorSummary) =>
      contributor.first_report_at ? `First report ${formatDate(contributor.first_report_at)}` : 'No first-report date',
  },
]))

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function reportsRoute(login: string) {
  return { name: 'public-user-reports', params: { login } }
}

async function loadContributorSpotlights() {
  const ajax = ajaxBar.value
  if (ajax) ajax.start()
  try {
    await homepageStore.loadContributors()
  } finally {
    if (ajax) ajax.stop()
  }
}

onMounted(() => {
  void loadContributorSpotlights()
})
</script>

<template>
  <q-ajax-bar
    v-if="$q.platform.isMobileUi"
    ref="ajaxBar"
    :position="$q.platform.isMobileUi ? 'top' : 'bottom'"
    color="secondary"
    size="5px"
    skip-hijack
  />
  <div>
    <div
      class="q-mb-md q-px-none"
      :class="$q.screen.gt.xs ? 'q-pl-xl' : 'text-center'"
      style="max-width: 760px;"
    >
      <div class="text-h4 text-weight-bold">Contributors shaping report quality.</div>
      <div class="text-body1 text-grey-4 q-mt-sm">
        Browse standout contributors and newer voices whose reports are helping the community compare settings and
        results more confidently.
      </div>
    </div>

    <div
      v-for="panel in panels"
      :key="panel.key"
      class="row q-mb-lg"
      :class="$q.screen.gt.sm ? (panel.key === 'top' ? 'justify-start' : 'justify-end') : ''"
    >
      <q-card
        flat
        bordered
        class="spotlight-panel"
        :class="panel.accentClass"
      >
        <q-card-section class="spotlight-panel__header">
          <div class="row items-start no-wrap q-gutter-md">
            <q-avatar size="44px" class="spotlight-panel__icon">
              <q-icon :name="panel.icon" size="24px" />
            </q-avatar>
            <div class="spotlight-panel__heading">
              <div class="text-h6 text-weight-bold">{{ panel.title }}</div>
              <div class="text-body2 text-grey-4 q-mt-xs">{{ panel.description }}</div>
            </div>
          </div>
        </q-card-section>

        <q-card-section v-if="panel.contributors.length > 0" class="spotlight-panel__body">
          <div class="contributor-card-rail">
            <router-link
              v-for="(contributor, index) in panel.contributors"
              :key="`${panel.key}-${contributor.login}`"
              :to="reportsRoute(contributor.login)"
              class="contributor-card"
            >
              <div class="contributor-card__rank">
                <span>#{{ index + 1 }}</span>
              </div>
              <q-avatar size="56px" class="contributor-card__avatar">
                <img v-if="contributor.avatar_url" :src="contributor.avatar_url" :alt="contributor.login">
                <span v-else>{{ contributor.login.slice(0, 2).toUpperCase() }}</span>
              </q-avatar>

              <div class="contributor-card__identity">
                <div class="text-subtitle1 text-weight-bold contributor-card__login">@{{ contributor.login }}</div>
                <div class="text-caption text-grey-4 contributor-card__footnote">
                  {{ panel.footnote(contributor) }}
                </div>
              </div>

              <div class="contributor-card__metrics">
                <div
                  v-for="chip in panel.chips(contributor)"
                  :key="chip"
                  class="contributor-card__metric"
                >
                  {{ chip }}
                </div>
              </div>

              <div class="contributor-card__cta">
                <span>View reports</span>
                <q-icon name="arrow_forward" size="16px" />
              </div>
            </router-link>
          </div>
        </q-card-section>

        <q-card-section v-else class="spotlight-panel__empty text-body2 text-grey-4">
          {{ panel.emptyText }}
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<style scoped>
.row.q-mb-lg {
  align-items: flex-start;
}

.spotlight-panel {
  background: linear-gradient(180deg, rgba(6, 12, 18, 0.88), rgba(11, 20, 30, 0.9)),
  rgba(9, 16, 24, 0.8);
  border-color: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  overflow: hidden;
  align-self: flex-start;
  height: auto;
  width: 70%
}

.spotlight-panel--top {
  box-shadow: inset 0 1px 0 rgba(255, 205, 97, 0.24);
}

.spotlight-panel--new {
  box-shadow: inset 0 1px 0 rgba(88, 207, 158, 0.24);
}

.spotlight-panel__header {
  padding: 20px 20px 10px;
}

.spotlight-panel__heading {
  min-width: 0;
}

.spotlight-panel__body {
  padding: 6px 20px 20px;
}

.spotlight-panel__icon {
  background: rgba(255, 255, 255, 0.08);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.contributor-card-rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.contributor-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 18px 16px 16px;
  border-radius: 18px;
  color: inherit;
  text-decoration: none;
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.08), transparent 38%),
  rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.contributor-card:hover {
  transform: translateY(-2px);
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.11), transparent 38%),
  rgba(255, 255, 255, 0.065);
  border-color: rgba(255, 255, 255, 0.14);
}

.contributor-card__rank {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.84);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.contributor-card__avatar {
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.contributor-card__identity {
  min-width: 0;
}

.contributor-card__login {
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.contributor-card__footnote {
  margin-top: 6px;
  line-height: 1.35;
}

.contributor-card__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.contributor-card__metric {
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.contributor-card__cta {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.74);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.spotlight-panel__empty {
  padding: 16px 20px 20px;
}

@media (max-width: 1439.98px) {
  .spotlight-panel {
    width: 90%
  }
}

@media (max-width: 1023.98px) {
  .spotlight-panel {
    width: 100%
  }

  .spotlight-panel__body {
    padding: 6px 16px 16px;
  }

  .contributor-card-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 599.98px) {
  .contributor-card-rail {
    grid-template-columns: 1fr;
  }

  .contributor-card {
    padding: 16px 14px 14px;
  }
}
</style>
