<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMeta, useQuasar } from 'quasar'
import ScrollToTop from 'components/elements/ScrollToTop.vue'
import SecondaryButton from 'components/elements/SecondaryButton.vue'

const sectionLinks = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'decky-loader', label: 'Install Decky Loader' },
  { id: 'plugin-install', label: 'Install the Plugin' },
  { id: 'faq', label: 'FAQ' },
]

const installTab = ref<'store' | 'manual'>('store')

const $q = useQuasar()

const showStickyToc = computed(() => $q.screen.width >= 1440)
const showTocDropdown = computed(() => !showStickyToc.value)

const deckyAsset = (file: string) =>
  new URL(`../assets/decky-plugin-install/${file}`, import.meta.url).href

const deckyStoreSteps = [
  {
    title: 'Open Decky Store',
    description:
      'Press the Quick Access button, switch to the Decky tab, and select the Decky Store tile to browse plugins.',
    images: [
      {
        src: deckyAsset('01-decky_store_1_open_decky_store-9.jpg'),
        alt: 'Open Decky Loader store on the Steam Deck',
      },
    ],
  },
  {
    title: 'Search for Deck Settings',
    description:
      'Use the search bar to find “Deck Settings”. Highlight the plugin card to view its description and release notes.',
    images: [
      {
        src: deckyAsset('01-decky_store_2_search_for_deck-settings_plugin-9.jpg'),
        alt: 'Search for Deck Settings plugin inside Decky store',
      },
    ],
  },
  {
    title: 'Install from the Store',
    description:
      'Select Install to download and apply the plugin. Once complete, Deck Settings appears in your Installed tab.',
    images: [
      {
        src: deckyAsset('01-decky_store_3_click_install_from_decky_store-9.jpg'),
        alt: 'Install Deck Settings plugin from Decky store',
      },
    ],
  },
]

const manualSteps = [
  {
    title: 'Download the latest release',
    description:
      'Switch to Desktop Mode, open a browser, and download the newest `decky-game-settings.zip` from the GitHub releases page.',
    images: [
      {
        src: deckyAsset('02-manual_download_1_download-latest-release-zip-file-from-github-in-desktop-mode-9.jpg'),
        alt: 'Download latest Deck Settings release from GitHub',
      },
    ],
  },
  {
    title: 'Enable developer mode in Decky Loader',
    description:
      'Return to Gaming Mode, open Decky Loader, and go to Settings → Developer Mode so you can sideload a plugin.',
    images: [
      {
        src: deckyAsset('03-gh_release_1_navigate_to_decky_loader_settings-9.jpg'),
        alt: 'Open Decky Loader settings',
      },
    ],
  },
  {
    title: 'Open Install from Zip',
    description:
      'Still in Decky Loader settings, choose Install Plugin from Zip to launch the file picker.',
    images: [{
      src: deckyAsset('03-gh_release_2_enable_developer_mode-9.jpg'),
      alt: 'Enable developer mode in Decky Loader settings',
    }],
  },
  {
    title: 'Select the downloaded archive',
    description:
      'Navigate to the folder you saved the release zip (usually `~/Downloads`). Highlight the Deck Settings zip file and confirm.',
    images: [
      {
        src: deckyAsset('03-gh_release_3_click_install_plugin_from_zip_file_button-9.jpg'),
        alt: 'Open Install Plugin from Zip option',
      },
    ],
  },
  {
    title: 'Install and refresh Decky Loader',
    description:
      'Decky Loader imports the plugin from the zip and adds it to your Installed list. Reload Decky Loader if prompted.',
    images: [
      {
        src: deckyAsset('03-gh_release_4_navigate_to_location_of_downloaded_zip_file-9.jpg'),
        alt: 'Select downloaded Deck Settings zip file',
      },
    ],
  },
  {
    title: 'Launch the plugin',
    description:
      'Open the Deck Settings entry inside Decky Loader to browse verified reports. For updates, repeat the download and install steps.',
    images: [{
      src: deckyAsset('03-gh_release_5_install_plugin_zip_file-9.jpg'),
      alt: 'Confirm plugin installation from zip',
    },
    ],
  },
]

/*METADATA*/
const metaTitle = ref('Deck Settings — Decky Plugin • Deck Verified')
const metaDescription = ref(
  'Instructions to install and use the Deck Settings plugin for Decky Loader — browse Deck Verified reports directly from your handheld.',
)

useMeta(() => ({
  title: metaTitle.value,
  titleTemplate: (title) => `${title}`,
  meta: {
    description: { name: 'description', content: metaDescription.value },
    ogTitle: { property: 'og:title', content: metaTitle.value },
    ogDescription: { property: 'og:description', content: metaDescription.value },
  },
}))
</script>

<template>
  <q-page class="bg-dark text-white q-pb-xl" padding>
    <div class="page-container q-pa-md">
      <q-page-sticky
        v-if="showStickyToc"
        position="top-right"
        :offset="[16, 16]"
        class="toc-wrapper">
        <q-card flat bordered class="toc-card">
          <q-card-section class="q-pb-none">
            <div class="text-caption text-uppercase">On this page</div>
          </q-card-section>
          <q-list dense class="q-pt-none">
            <q-item
              v-for="link in sectionLinks"
              :key="link.id"
              clickable
              tag="a"
              class="toc-link"
              :href="`#${link.id}`"
            >
              <q-item-section>{{ link.label }}</q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </q-page-sticky>

      <div v-if="showTocDropdown" class="toc-menu q-mb-md">
        <q-expansion-item
          dense
          expand-icon="keyboard_arrow_down"
          label="Page Index"
          icon="menu_book"
          header-class="toc-menu__header"
        >
          <q-list dense>
            <q-item
              v-for="link in sectionLinks"
              :key="`dropdown-${link.id}`"
              clickable
              tag="a"
              :href="`#${link.id}`"
            >
              <q-item-section>{{ link.label }}</q-item-section>
            </q-item>
          </q-list>
        </q-expansion-item>
      </div>

      <q-card flat class="decky-instructions">
        <q-card-section id="introduction" class="section section-intro">
          <div class="row items-center">
            <div class="col-md-8 col-12">
              <h2 class="text-h4 q-mb-sm">Deck Settings — Decky Plugin</h2>
              <p class="text-body1 q-mb-none">
                Browse Deck Verified reports directly from Decky Loader. The plugin pulls curated settings,
                performance notes, and quick links for your favourite handheld titles so you can fine-tune games
                without leaving Gaming Mode.
              </p>
            </div>
            <div class="col-md-4 col-12 q-pl-md-xl q-pt-md">
              <SecondaryButton
                :full-width="$q.screen.lt.md"
                icon="fab fa-github"
                href="https://github.com/DeckSettings/decky-game-settings"
                target="_blank" rel="noopener"
                label="View Plugin Source"
              />
            </div>
          </div>
        </q-card-section>

        <q-separator dark inset class="q-mx-lg" />

        <q-card-section id="decky-loader" class="section">
          <div class="section-header">
            <h3 class="text-h5 q-mb-xs">Install Decky Loader</h3>
            <p class="text-body2 q-mb-none">
              Deck Settings runs inside Decky Loader. Follow the Decky team’s instructions for your platform, then
              return here to add the plugin.
            </p>
          </div>
          <div class="q-mt-md">
            <q-list dense class="link-list">
              <q-item tag="a" href="https://decky.xyz/" target="_blank" rel="noopener" clickable>
                <q-item-section avatar>
                  <q-icon name="launch" color="primary" />
                </q-item-section>
                <q-item-section>
                  Decky Loader installation guide (Steam Deck, Windows handhelds, Linux desktops)
                </q-item-section>
              </q-item>
            </q-list>
            <ul class="q-mt-md">
              <li>Ensure you complete Decky Loader’s initial setup and restart Steam if prompted.</li>
              <li>Verify internet connectivity; the plugin fetches live Deck Verified data.</li>
            </ul>
          </div>
        </q-card-section>

        <q-separator dark inset class="q-mx-lg" />

        <q-card-section id="plugin-install" class="section">
          <div class="section-header">
            <h3 class="text-h5 q-mb-xs">Install the Deck Settings Plugin</h3>
            <p class="text-body2 q-mb-none">
              Pick the installation flow that suits you. The Decky Store path is fast and curated,
              while the manual method always delivers the newest features direct from GitHub
              releases—perfect if you want updates before they land in the store.
            </p>
          </div>

          <q-tabs
            v-model="installTab"
            class="text-white q-mt-md"
            dense
            align="justify"
            active-color="primary"
            indicator-color="primary"
          >
            <q-tab name="store" label="Decky Store Installation" icon="store" />
            <q-tab name="manual" label="Manual Installation" icon="build" />
          </q-tabs>

          <q-tab-panels v-model="installTab" animated class="q-mt-lg">
            <q-tab-panel name="store">
              <q-list>
                <q-item v-for="(step, index) in deckyStoreSteps" :key="step.title">
                  <q-item-section>
                    <q-item-label>
                      <span class="text-primary">Step {{ index + 1 }}:</span> {{ step.title }}
                    </q-item-label>
                    <q-item-label>
                      <p>{{ step.description }}</p>
                    </q-item-label>
                    <q-img
                      v-for="(stepImage, imageIndex) in step.images"
                      :key="`${step.title}-${imageIndex}`"
                      :src="stepImage.src"
                      :alt="stepImage.alt"
                      class="q-mt-sm screenshot"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
              <div class="q-mt-lg info-callout">
                <q-icon name="info" color="primary" size="sm" class="q-mr-sm" />
                <span>Once installed, Deck Settings appears in Decky Loader → Installed. Launch it to browse reports.</span>
              </div>
            </q-tab-panel>

            <q-tab-panel name="manual">

              <q-list>
                <q-item v-for="(step, index) in manualSteps" :key="step.title">
                  <q-item-section>
                    <q-item-label>
                      <span class="text-primary">Step {{ index + 1 }}:</span> {{ step.title }}
                    </q-item-label>
                    <q-item-label>
                      <p>{{ step.description }}</p>
                    </q-item-label>
                    <q-img
                      v-for="(stepImage, imageIndex) in step.images"
                      :key="`${step.title}-${imageIndex}`"
                      :src="stepImage.src"
                      :alt="stepImage.alt"
                      class="q-mt-sm screenshot"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
              <div class="q-mt-lg info-callout">
                <q-icon name="tips_and_updates" color="primary" size="sm" class="q-mr-sm" />
                <span>To install future releases, download the new zip from GitHub and repeat Steps 3–6.</span>
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <q-separator dark inset class="q-mx-lg" />

        <q-card-section id="faq" class="section">
          <div class="section-header">
            <h3 class="text-h5 q-mb-xs">Frequently Asked Questions</h3>
            <p class="text-body2 q-mb-md">
              Expand a question to learn more about how Deck Settings works with Decky Loader.
            </p>
          </div>
          <q-expansion-item
            label="Does this plugin modify my games or system?"
            icon="verified"
            expand-icon="keyboard_arrow_down"
            header-class="faq-header"
          >
            Deck Settings displays community-sourced guidance only. It does not alter files, tweak performance
            settings, or run scripts on your system.
          </q-expansion-item>
          <q-expansion-item
            label="Do I need an internet connection?"
            icon="cloud"
            class="q-mt-sm"
            expand-icon="keyboard_arrow_down"
            header-class="faq-header"
          >
            Yes. Reports, screenshots, and embedded videos are pulled from Deck Verified and community-hosted
            resources. Cached content may appear offline, but fresh data requires connectivity.
          </q-expansion-item>
          <q-expansion-item
            label="Where can I report bugs or request features?"
            icon="bug_report"
            class="q-mt-sm"
            expand-icon="keyboard_arrow_down"
            header-class="faq-header"
          >
            Use the GitHub repository issues page to report bugs, request features, or contribute translations. Pull
            requests are welcome.
          </q-expansion-item>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <SecondaryButton
            :full-width="$q.screen.lt.sm"
            icon="fab fa-github"
            href="https://github.com/DeckSettings/decky-game-settings"
            target="_blank" rel="noopener"
            label="View Plugin Source"
          />
        </q-card-actions>
      </q-card>
    </div>
    <ScrollToTop />
  </q-page>
</template>


<style scoped>
.page-container {
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
}

.decky-instructions {
  max-width: 940px;
  margin: 0 auto;
  background: color-mix(in srgb, var(--q-dark) 72%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  border-radius: 12px;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.section {
  padding: clamp(20px, 3vw, 40px) clamp(20px, 6vw, 72px);
}

.section-intro {
  background: rgba(255, 255, 255, 0.03);
  padding: clamp(24px, 4vw, 48px) clamp(24px, 7vw, 80px);
}

.section-header p {
  max-width: 640px;
}

.toc-wrapper {
  z-index: 3;
}

.toc-card {
  background: rgba(0, 0, 0, 0.65);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  min-width: 200px;
}

.toc-link {
  color: inherit;
}

.toc-link:hover {
  color: var(--q-primary);
}

.toc-menu {
  max-width: 940px;
  margin: 0 auto 15px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 4px 12px;
}

.toc-menu__header {
  background: transparent;
}

.decky-instructions .q-card-actions {
  padding: 12px clamp(20px, 6vw, 72px);
}

.step-list {
  padding-left: 18px;
}

.screenshot {
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.info-callout {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(49, 130, 206, 0.12);
  border: 1px solid rgba(49, 130, 206, 0.32);
}

.link-list .q-item {
  border-radius: 10px;
  transition: background 0.2s ease;
}

.link-list .q-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.faq-header {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}

@media (min-width: 1024px) {
  .page-container {
    padding: 28px;
  }
}
</style>
