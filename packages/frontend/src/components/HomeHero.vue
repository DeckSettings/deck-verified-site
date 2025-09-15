<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import SecondaryButton from 'components/elements/SecondaryButton.vue'

const baseUrl = ref((`${import.meta.env.BASE_URL ?? ''}`).replace(/^\/$/, '').replace(/\/$/, ''))
const heroBackgroundImageUrl = ref(`${baseUrl.value}/hero-background2.jpg`)

// Reactive state to control the visibility of the background image
const isBackgroundHidden = ref(false)

// Ref to get a direct reference to the page-content-container div in the template
const contentContainer = ref<HTMLElement | null>(null)

// Function to check if the user has scrolled past the hero section
const checkScroll = () => {
  if (!contentContainer.value) return

  const rect = contentContainer.value.getBoundingClientRect()

  // If the bottom of the content is above the viewport top, it's scrolled out of view
  if (rect.bottom <= 0) {
    isBackgroundHidden.value = true
  } else {
    isBackgroundHidden.value = false
  }
}

// Add the scroll listener when the component is mounted
onMounted(() => {
  window.addEventListener('scroll', checkScroll)
  // Initial check on load to set the correct state
  checkScroll()
})

// Remove the scroll listener when the component is unmounted to prevent memory leaks
onUnmounted(() => {
  window.removeEventListener('scroll', checkScroll)
})
</script>

<template>
  <!-- Fixed background image -->
  <div class="background-container"
       :class="{ 'hide-component': isBackgroundHidden }"
       :style="{ backgroundImage: `linear-gradient(to top, var(--q-dark) 50%, transparent), url('${heroBackgroundImageUrl}')` }"></div>

  <!-- The content that scrolls. -->
  <div ref="contentContainer" class="page-content-container row items-center q-pa-xs-md q-pa-sm-xl full-width">
    <div class="col-xs-12 col-md-6 text-left q-pt-md q-px-md q-pb-none">
      <h1 class="text-h3 q-mb-lg q-mt-none" :class="{'text-center': $q.screen.lt.sm}">
        Steam Deck Game Settings & Performance Reports
      </h1>
      <p class="text-body1" :class="{'text-center': $q.screen.lt.sm}">
        <strong>Deck Verified</strong> is a fully open-source project that helps gamers optimize performance on
        handheld
        gaming PCs such as the <strong>Steam Deck</strong>, <strong>ASUS ROG Ally</strong>, <strong>Lenovo Legion
        Go</strong>, and dozens of other handheld gaming PCs — with new device support added via community request.
      </p>
      <p class="text-body1" :class="{'text-center': $q.screen.lt.sm}">
        Whether you're aiming for smooth 60 FPS gameplay or battery-efficient settings, this community-driven resource
        delivers real-world performance reports, graphics settings, controller mappings, and compatibility notes.
      </p>
      <div class="q-pb-md" :class="{'text-center': $q.screen.lt.sm}">
        <SecondaryButton
          :full-width="$q.screen.lt.sm"
          icon="fab fa-github"
          href="https://github.com/DeckSettings/game-reports-steamos"
          target="_blank" rel="noopener"
          label="View Reports Source"
        />
        <SecondaryButton
          :full-width="$q.screen.lt.sm"
          :class="{'q-mt-sm' : $q.screen.lt.sm}"
          icon="fab fa-github"
          href="https://github.com/DeckSettings/deck-verified-site"
          target="_blank" rel="noopener"
          label="View Website Source"
        />
        <p class="text-caption q-mt-md" :class="{'text-center': $q.screen.lt.sm}">
          All game report data and website source code are available on GitHub. Feel free to contribute!
        </p>
      </div>
    </div>
    <div class="col-xs-12 col-md-6 q-pa-md q-pb-none flex flex-center gt-sm">
      <img :src="`${baseUrl}/hero-image.png`" alt="Hero Image" class="hero-image">
    </div>
    <div class="full-width row justify-center q-mb-lg q-px-md">
      <div class="q-ml-md q-mt-sm q-mt-none-md">
        <PrimaryButton
          color="secondary"
          :full-width="$q.screen.lt.sm"
          :class="{'q-mt-sm' : $q.screen.lt.sm}"
          :size="$q.screen.lt.sm ? 'md': 'lg'"
          icon="tune"
          label="Browse Steam Deck Settings"
          :to="{ name: 'steam-deck-settings' }"
        />
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
  z-index: 0;
  /* Set the background-image in the template with javascript: */
  /*background-image: url('https://shared.steamstatic.com/store_item_assets/steam/apps/1888930/library_hero.jpg');*/
  background-repeat: no-repeat;
  opacity: 1;
  visibility: visible;
  transition: opacity 0.5s ease-in-out, visibility 0.5s ease-in-out;
}

.background-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: /* Top fade */ linear-gradient(to bottom, transparent 20%, rgba(0, 0, 0, 0.6) 50%, var(--q-dark) 100%),
    /* Left fade */ linear-gradient(to right, var(--q-dark) 40%, transparent 70%, transparent 90%, var(--q-dark) 100%),
    /* Left fade */ linear-gradient(to right, var(--q-dark) 40%, transparent 70%, transparent 90%, var(--q-dark) 100%),
    /* Right fade */ linear-gradient(to left, var(--q-dark) 0%, transparent 30%, transparent 70%, var(--q-dark) 100%);
  mix-blend-mode: darken; /* Ensures darker areas blend naturally with the image */
  z-index: 1; /* Place it above the background image */
}

/*
 * Class to apply to the .background-image-container element to hide it once we have scrolled past it
 */
.hide-component {
  opacity: 0;
  visibility: hidden;
}

/* sm width */
.page-content-container {
  position: relative;
  z-index: 2;
  background-color: transparent;
  overflow: hidden;
}

.hero-image {
  width: 100%;
  max-width: 700px;
  height: auto;
}

/* sm width */
@media (min-width: 600px) {
  .page-content-container > div {
    margin: 0 auto;
  }
}
</style>
