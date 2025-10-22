<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from 'src/stores/config-store'
import { APP_FEEDS } from 'src/constants/feeds'
import { apiUrl } from 'src/utils/api'
import { simSteamdb, simPcgamingwiki } from 'quasar-extras-svg-icons/simple-icons-v14'
import sdhqLogo from 'src/assets/icons/sdhq.svg'
import itadLogo from 'src/assets/icons/itad-icon.svg'
import protondbLogo from 'src/assets/icons/protondb.svg'
import steamLogo from 'src/assets/icons/steam.svg'

const configStore = useConfigStore()
const { isHydrated, showHomeWelcomeCard, hideDuplicateReports } = storeToRefs(configStore)
const isAboutDialogOpen = ref(false)

const closeAboutDialog = () => {
  isAboutDialogOpen.value = false
}

const handleSettingsClose = () => {
  closeAboutDialog()
}

const handleFeedToggle = (key: string, enabled: boolean) => {
  if (!isHydrated.value) return
  configStore.setFeedDisabled(key, !enabled)
}

const toggleFeed = (key: string) => {
  if (!isHydrated.value) return
  const isEnabled = !configStore.isFeedDisabled(key)
  handleFeedToggle(key, !isEnabled)
}

const handleHomeWelcomeToggle = (value: boolean) => {
  if (!isHydrated.value) return
  configStore.setShowHomeWelcomeCard(value)
}

const toggleHomeWelcome = () => {
  if (!isHydrated.value) return
  configStore.toggleShowHomeWelcomeCard()
}

const handleHideDuplicatesToggle = (value: boolean) => {
  if (!isHydrated.value) return
  configStore.setHideDuplicateReports(value)
}

const toggleHideDuplicates = () => {
  if (!isHydrated.value) return
  configStore.toggleHideDuplicateReports()
}

const feeds = computed(() => APP_FEEDS)

const websiteLink = computed(() => apiUrl('/'))
const privacyPolicyLink = computed(() => apiUrl('/privacy-policy'))
const termsOfServiceLink = computed(() => apiUrl('/terms-of-service'))
const discordLink = 'https://streamingtech.co.nz/discord'
</script>

<template>
  <q-card flat bordered>
    <q-card-section class="side-dialog-header row items-center justify-between no-wrap">

      <div class="text-subtitle1 text-weight-bold">App Settings</div>
      <q-btn
        outline round
        color="primary"
        icon="close"
        size="sm"
        v-close-popup
        @click="handleSettingsClose"
      />
    </q-card-section>

    <q-separator dark />

    <q-card-section class="q-gutter-lg">
      <section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Home Cards</div>
        <q-list>
          <q-item
            clickable v-ripple
            class="side-dialog-menu-list-item"
            @click="toggleHomeWelcome"
          >
            <q-item-section avatar>
              <q-avatar color="primary">
                <q-icon name="home" />
              </q-avatar>
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-body1 text-weight-medium">
                Welcome Card
              </q-item-label>
              <q-item-label caption class="text-grey-5">
                Show the welcome card with tips on using this app
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <q-toggle
                color="primary"
                :model-value="showHomeWelcomeCard"
                :disable="!isHydrated"
                @update:model-value="handleHomeWelcomeToggle"
                @click.stop
              />
            </q-item-section>
          </q-item>

          <q-item
            v-for="feed in feeds"
            :key="feed.key"
            clickable v-ripple
            class="side-dialog-menu-list-item"
            @click="toggleFeed(feed.key)"
          >
            <q-item-section avatar>
              <q-avatar v-if="feed.logo">
                <img :src="feed.logo" :alt="`${feed.title} logo`" loading="lazy">
              </q-avatar>
              <q-icon v-else name="rss_feed" size="40px" color="primary" />
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-body1 text-weight-medium">
                {{ `${feed.title} Feed` }}
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
                @update:model-value="(value) => handleFeedToggle(feed.key, value)"
                @click.stop
              />
            </q-item-section>
          </q-item>
        </q-list>
      </section>

      <section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Reports</div>
        <q-list>
          <q-item
            clickable v-ripple
            class="side-dialog-menu-list-item"
            @click="toggleHideDuplicates"
          >
            <q-item-section avatar>
              <q-avatar color="primary">
                <q-icon name="content_copy" />
              </q-avatar>
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-body1 text-weight-medium">
                Hide Duplicate Reports
              </q-item-label>
              <q-item-label caption class="text-grey-5">
                Hide reports that have been flagged as duplicates by the community
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <q-toggle
                color="primary"
                :model-value="hideDuplicateReports"
                :disable="!isHydrated"
                @update:model-value="handleHideDuplicatesToggle"
                @click.stop
              />
            </q-item-section>
          </q-item>
        </q-list>
      </section>
    </q-card-section>

    <q-card-section class="q-gutter-lg">
      <section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm">More...</div>
        <q-list>
          <q-item
            clickable v-ripple
            class="side-dialog-menu-list-item"
            @click="isAboutDialogOpen = true"
          >
            <q-item-section avatar>
              <q-avatar color="primary">
                <q-icon name="info" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-body1 text-weight-medium">
                About
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>
      </section>
    </q-card-section>
  </q-card>

  <!-- ABOUT DIALOG -->
  <q-dialog
    v-model="isAboutDialogOpen"
    backdrop-filter="blur(2px)"
    full-height
    maximized
    position="left"
    transition-show="slide-up"
    transition-hide="slide-down"
    transition-duration="100"
  >
    <q-card class="side-dialog-card"
            :style="$q.screen.lt.sm ? 'min-width: 100vw;' : 'min-width: 600px;width: 600px;'"
    >
      <q-card-section class="side-dialog-content">
        <q-card flat bordered class="side-dialog-inner-card">
          <q-card-section class="side-dialog-header row items-center justify-between no-wrap">

            <div class="text-subtitle1 text-weight-bold">About</div>
            <q-btn
              outline round
              color="primary"
              icon="close"
              size="sm"
              @click="closeAboutDialog"
            />
          </q-card-section>

          <q-separator dark />

          <q-card-section class="side-dialog-body scroll q-pa-lg q-gutter-lg">
            <section>
              <div class="text-h6 text-weight-bold q-mb-sm">About This Project</div>
              <p class="text-body2">
                I started the
                <a class="inline-link" href="https://github.com/DeckSettings" target="_blank" rel="noopener">
                  <strong>Deck Settings</strong>
                </a>
                project to bring the handheld gaming community together around one shared goal — making games
                run their best on devices like the <strong>Steam Deck</strong>, <strong>ASUS ROG Ally</strong>, and
                <strong>Lenovo Legion Go</strong>. What began as a small GitHub repository of performance reports has
                grown into a connected platform that includes:
              </p>

              <ul class="text-body2 q-pl-lg">
                <li>
                  The
                  <a class="inline-link" href="https://github.com/DeckSettings/decky-game-settings" target="_blank"
                     rel="noopener">
                    <strong>Deck Settings</strong>
                  </a>
                  Decky plugin
                </li>
                <li>
                  The
                  <a class="inline-link" href="https://deckverified.games/" target="_blank" rel="noopener">
                    <strong>DeckVerified.games</strong>
                  </a>
                  website
                </li>
                <li>
                  The
                  <a class="inline-link"
                     href="https://play.google.com/store/apps/details?id=nz.co.streamingtech.deckverified"
                     target="_blank" rel="noopener">
                    <strong>DeckVerified: Reports & Guides</strong>
                  </a>
                  app
                </li>
              </ul>

              <p class="text-body2">
                The goal behind it all was to create an open platform that can grow alongside the ever-expanding
                handheld gaming community. Each year brings new devices, new versions of SteamOS and other Linux-based
                gaming systems, and new ways to play across stores like GOG, Epic, and itch.io. The platform is designed
                to be agnostic, open, and collaborative, giving everyone a place to share, compare, and refine their
                gaming experiences together.
              </p>

              <p class="text-body2 q-mb-none">
                To take part, simply sign in with a <strong>GitHub account</strong>. It’s free, quick, and requires only
                an email address. GitHub provides the backbone that keeps everything open, accountable, and
                community-driven, allowing anyone to contribute to the project that keeps handheld gaming moving
                forward.
              </p>
            </section>

            <section>
              <div class="text-h6 text-weight-bold q-mb-sm">Explore and Connect</div>
              <q-list>
                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  :href="websiteLink"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar color="primary">
                      <q-icon name="web" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      Visit the Website
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>
                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  :href="discordLink"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar color="primary">
                      <q-icon name="discord" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      Join the Discord
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>
              </q-list>
            </section>

            <section>
              <div class="text-h6 text-weight-bold q-mb-sm">Acknowledgments</div>
              <div class="text-body2 q-mb-sm">
                Deck Verified proudly integrates logos, links, and data from several great resources that support the
                handheld gaming community:
              </div>
              <q-list>
                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  href="https://store.steampowered.com/"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar>
                      <img :src="steamLogo" alt="Steam logo" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      Steam Store
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Official storefront and APIs powering game data.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>

                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  href="https://www.protondb.com/"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar>
                      <img :src="protondbLogo" alt="ProtonDB logo" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      ProtonDB
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Community-sourced compatibility reports for Proton.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>

                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  href="https://steamdeckhq.com/"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar>
                      <img :src="sdhqLogo" alt="Steam Deck HQ logo" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      Steam Deck HQ (SDHQ)
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      In-depth game performance guides and community insights.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>

                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  href="https://steamdb.info/"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar>
                      <q-icon :name="simSteamdb" size="40px" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      SteamDB
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Extensive datastore tracking game builds, prices, and analytics.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>

                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  href="https://isthereanydeal.com/"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar>
                      <img :src="itadLogo" alt="IsThereAnyDeal logo" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      IsThereAnyDeal (ITAD)
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Price tracking and deal alerts across major stores.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>

                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  href="https://www.pcgamingwiki.com/wiki/Home"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar>
                      <q-icon :name="simPcgamingwiki" :style="{ color: '#536fa8' }" size="40px" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      PCGamingWiki
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Community-maintained fixes and configuration tips for PC games.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>
              </q-list>
            </section>

            <section>
              <div class="text-h6 text-weight-bold q-mb-sm">Legal & Privacy</div>
              <q-list>
                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  :href="privacyPolicyLink"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar color="primary">
                      <q-icon name="policy" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      Privacy Policy
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Learn how Deck Verified handles your data.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>
                <q-item
                  clickable v-ripple
                  class="side-dialog-menu-list-item"
                  tag="a"
                  :href="termsOfServiceLink"
                  target="_blank"
                  rel="noopener"
                >
                  <q-item-section avatar>
                    <q-avatar color="primary">
                      <q-icon name="gavel" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body1 text-weight-medium">
                      Terms of Service
                    </q-item-label>
                    <q-item-label caption class="text-grey-5">
                      Review the rules for using the platform.
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="open_in_new" />
                  </q-item-section>
                </q-item>
              </q-list>
            </section>
          </q-card-section>
        </q-card>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
a.inline-link {
  color: var(--q-primary);
  text-decoration-color: color-mix(in srgb, var(--q-primary) 50%, transparent);
}
</style>
