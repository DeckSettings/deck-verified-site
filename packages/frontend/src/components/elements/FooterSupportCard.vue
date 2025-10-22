<template>
  <q-card
    flat
    square
    class="footer-support-card bg-transparent text-center"
  >
    <q-card-section class="footer-support-card-body column items-center">
      <div class="column items-center text-center q-gutter-xs">
        <div class="text-subtitle2 text-weight-bold">Made by Josh Sunnex (Josh.5)</div>
        <div class="text-caption">
          Built for the community, free and open-source.
          <br />
          If you find it useful, consider supporting development.
        </div>
      </div>
      <div class="row justify-center q-gutter-sm footer-support-card-actions">
        <q-btn
          round
          dense
          unelevated
          color="primary"
          text-color="white"
          :icon="simPatreon"
          href="https://www.patreon.com/join/josh5"
          target="_blank"
          rel="noopener"
        >
          <q-tooltip anchor="top middle" self="bottom middle">Support on Patreon</q-tooltip>
        </q-btn>
        <q-btn
          round
          dense
          color="primary"
          text-color="white"
          :icon="simGithubsponsors"
          href="https://github.com/sponsors/Josh5"
          target="_blank"
          rel="noopener"
        >
          <q-tooltip anchor="top middle" self="bottom middle">Sponsor this project on GitHub</q-tooltip>
        </q-btn>
        <q-btn
          round
          dense
          color="primary"
          text-color="white"
          :icon="simKofi"
          href="https://ko-fi.com/josh5coffee"
          target="_blank"
          rel="noopener"
        >
          <q-tooltip anchor="top middle" self="bottom middle">Buy Josh a Ko-fi</q-tooltip>
        </q-btn>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { simGithubsponsors, simKofi, simPatreon } from 'quasar-extras-svg-icons/simple-icons-v14'
</script>

<style scoped>
.footer-support-card {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

.footer-support-card-body {
  gap: 8px;
  padding: 12px 16px;
}

.footer-support-card-actions {
  flex-wrap: wrap;
}
</style>
