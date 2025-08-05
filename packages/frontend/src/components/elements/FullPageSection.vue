<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()

const props = defineProps<{
  backgroundImageUrl?: string
  backgroundColour?: string
  transition?: string
  scrollLockDuration?: number
}>()

const isBackgroundVisible = ref(false)
const sectionRef = ref<HTMLElement | null>(null)
const contentWrapperRef = ref<HTMLElement | null>(null)

// Generate background
const fadeGradient = computed(() => {
  const colour = props.backgroundColour || 'transparent'
  return `linear-gradient(
    to bottom,
    transparent 0%,
    ${colour} 30%,
    ${colour} 80%,
    transparent 100%
  )`
})
const bgStyle = computed(() => {
  const layers = [fadeGradient.value]
  if (props.backgroundImageUrl) {
    layers.push(`url(${props.backgroundImageUrl})`)
  }
  return {
    backgroundImage: layers.join(','),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transitionDuration: props.transition || '1s',
  }
})

// Function checks if the user has scrolled past the section
const checkScroll = () => {
  if (!sectionRef.value) return

  const rect = sectionRef.value.getBoundingClientRect()
  const windowHeight = window.innerHeight

  // Show the background if any part of the section is in the viewport
  isBackgroundVisible.value = rect.bottom > 0 && rect.top < windowHeight
}

onMounted(() => {
  if (!$q.platform.is.mobile) {
    // Use a simple scroll event listener instead of an IntersectionObserver for this
    window.addEventListener('scroll', checkScroll)
  }
  checkScroll() // Initial check
})

onUnmounted(() => {
  if (!$q.platform.is.mobile) {
    window.removeEventListener('scroll', checkScroll)
  }
})
</script>

<template>
  <section
    ref="sectionRef" class="full-page-section"
    :style="{
      '--scroll-lock-height': props.scrollLockDuration ? `${props.scrollLockDuration * 100}vh` : '0',
    }"
  >
    <div
      class="background-image"
      :class="{
        'is-visible':        isBackgroundVisible,
        'only-colour':       !props.backgroundImageUrl
      }"
      :style="bgStyle"
    />

    <div ref="contentWrapperRef" class="content-wrapper">
      <q-container class="q-pa-md">
        <slot
          :scrollContainer="contentWrapperRef"
        />
      </q-container>
    </div>
  </section>
</template>

<style scoped>
.full-page-section {
  position: relative;
  min-height: 100vh;
  /* Important - This adds the extra height for the scroll lock effect using content-wrapper */
  height: calc(100vh + var(--scroll-lock-height));
}

.background-image {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  z-index: 0;
  opacity: 0;
  transition-property: opacity;
  transition-timing-function: ease-in-out;
  pointer-events: none;
  background-repeat: no-repeat;
  visibility: visible;
}

.background-image.is-visible {
  opacity: 0.3;
}

.background-image.only-colour.is-visible {
  /* Removes opacity when we only have a background colour */
  opacity: 1;
}

.content-wrapper {
  /* This is the container that will stick */
  position: sticky;
  top: 0;
  min-height: 100vh;
  z-index: 1;
  display: block;
}
</style>
