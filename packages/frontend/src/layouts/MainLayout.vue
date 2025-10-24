<template>
  <q-layout :view="$q.screen.isShortLandscape ? 'hhh lpR fFf' : 'hHh lpR fFf'">

    <q-header class="app-header text-white">
      <q-toolbar class="header-toolbar q-px-sm q-py-md q-px-sm-lg q-py-sm-lg">
        <div class="header-leading row items-center no-wrap q-gutter-sm">
          <HeaderUserMenu
            v-if="enableLogin"
            display-mode="hamburger"
            class="header-hamburger lt-md"
          />

          <div class="logo-container">
            <router-link to="/">
              <PageIcon :size="$q.screen.width < 440 ? 36 : 30" :short-mode="$q.screen.width < 440" />
            </router-link>
          </div>
        </div>

        <q-space />

        <div class="header-actions" :class="{'full-width': $q.screen.lt.sm}">
          <HeaderSearch class="header-actions__search" />
          <HeaderUserMenu v-if="enableLogin" class="header-actions__user gt-sm" />
        </div>
      </q-toolbar>
    </q-header>

    <q-page-container class="bg-dark q-pb-none" style="padding-bottom:0">
      <router-view />
    </q-page-container>

    <q-footer class="app-footer static-footer text-white" :height-hint="0">
      <div class="footer-inner row items-start q-col-gutter-xl q-px-md q-py-lg">
        <!-- Left brand + socials -->
        <div class="col-12 col-md-6">
          <div class="text-h5 q-mb-sm">Deck Verified Games</div>
          <div class="text-subtitle2 q-mb-md">Community reports and settings for handheld PCs.</div>

          <div class="row items-center q-gutter-sm">
            <q-btn round dense unelevated color="white" text-color="black" :icon="simGithubsponsors"
                   href="https://github.com/sponsors/Josh5" target="_blank" rel="noopener"
            >
              <q-tooltip>Become one of my GitHub Sponsors</q-tooltip>
            </q-btn>
            <q-btn round dense unelevated color="white" text-color="black" :icon="simKofi"
                   href="https://ko-fi.com/josh5coffee" target="_blank" rel="noopener"
            >
              <q-tooltip>Support me on Ko-fi</q-tooltip>
            </q-btn>
            <q-btn round dense unelevated color="white" text-color="black" :icon="simPatreon"
                   href="https://www.patreon.com/join/josh5" target="_blank" rel="noopener"
            >
              <q-tooltip>Become a Patreon member</q-tooltip>
            </q-btn>
          </div>
        </div>

        <!-- Right columns -->
        <div class="col-12 col-md-6 row q-col-gutter-xl">
          <div class="col-6">
            <div class="text-subtitle1 q-mb-sm">About</div>
            <ul class="footer-list">
              <li>
                <router-link class="footer-link" :to="{ name: 'about' }">About</router-link>
              </li>
              <!--<li>
                <a class="footer-link" href="https://github.com/DeckSettings/deck-verified-site/issues/new/choose"
                     target="_blank" rel="noopener">Support</a>
              </li>-->
              <li>
                <router-link class="footer-link" :to="{ name: 'privacy-policy' }">Privacy Policy</router-link>
              </li>
              <li>
                <router-link class="footer-link" :to="{ name: 'terms-of-service' }">Terms of Service</router-link>
              </li>
            </ul>
          </div>
          <div class="col-6">
            <div class="text-subtitle1 q-mb-sm">Community</div>
            <ul class="footer-list">
              <li>
                <a class="footer-link"
                   href="https://github.com/DeckSettings/game-reports-steamos/issues/new?template=GAME-REPORT.yml"
                   target="_blank" rel="noopener">Contribute</a></li>
              <li>
                <a class="footer-link"
                   href="https://github.com/DeckSettings/deck-verified-site/issues/new?template=NEW-DEVICE.yml"
                   target="_blank" rel="noopener">Add New Device</a></li>
              <li>
                <a class="footer-link" href="https://streamingtech.co.nz/discord" target="_blank"
                   rel="noopener">Discord</a>
              </li>
              <li>
                <a class="footer-link" href="https://www.patreon.com/join/josh5" target="_blank"
                   rel="noopener">Patreon</a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <q-separator dark class="q-my-md" />
      <div class="row justify-between items-center q-px-md q-pb-md text-caption">
        <div>© 2018-2025 by Josh Sunnex. All rights reserved.</div>
        <div></div>
      </div>
    </q-footer>

  </q-layout>
</template>

<script setup lang="ts">
import HeaderSearch from 'components/HeaderSearch.vue'
import HeaderUserMenu from 'components/HeaderUserMenu.vue'
import PageIcon from 'components/elements/PageIcon.vue'
import { useFeatureFlags } from 'src/composables/useFeatureFlags'
import { simGithubsponsors, simKofi, simPatreon } from 'quasar-extras-svg-icons/simple-icons-v14'

const { enableLogin } = useFeatureFlags()
</script>

<style scoped>
.app-header {
  background: color-mix(in srgb, var(--q-dark) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid color-mix(in srgb, white 12%, transparent);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
}

.header-toolbar {
  background: transparent;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin: 0 auto;
  width: 100%;
  gap: 8px;
}

.header-hamburger {
  display: flex;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.header-actions__search {
  flex: 1 1 320px;
  display: flex;
  justify-content: flex-end;
}

.header-actions__user {
  flex-shrink: 0;
}

.header-actions.full-width {
  width: 100%;
  flex-direction: column;
  align-items: stretch;
}

.header-actions.full-width .header-actions__search {
  flex: 1 1 100%;
  width: 100%;
  justify-content: flex-start;
}

.header-actions.full-width .header-actions__user {
  align-self: flex-end;
}

.header-leading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-footer {
  background: color-mix(in srgb, var(--q-dark) 70%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid color-mix(in srgb, white 12%, transparent);
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.25);
}

/* Make layout footer part of normal flow (not fixed) */
.static-footer {
  position: static !important;
}

.footer-inner {
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
}

.footer-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-list li {
  margin: 6px 0;
}

.footer-link {
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
}

.footer-link:hover {
  text-decoration: underline;
}

.logo-container {
  flex-shrink: 1;
  flex-grow: 1;
  width: 100%;
  text-align: center;
  margin-bottom: 10px;
  display: flex;
  justify-content: center;
}

.logo-container img {
  width: 183px;
  height: 20px;
}

@media (max-width: 599.98px) {
  .header-toolbar {
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .header-leading {
    order: 0;
    width: 100%;
    justify-content: flex-start;
    padding-left: 8px;
  }

  .logo-container {
    width: auto;
    margin-bottom: 0;
  }

  .header-actions {
    order: 2;
    width: 100%;
  }
}

@media (min-width: 600px) {
  .logo-container {
    width: auto;
    text-align: left;
    margin-bottom: 0;
  }
}
</style>
