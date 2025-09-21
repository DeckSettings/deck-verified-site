<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { gsap } from 'gsap'
import { useScrollTrigger } from 'src/composables/useScrollTrigger'
import type { ScrollTriggerInstance } from 'src/composables/useScrollTrigger'
import { resolveCssColor } from 'src/utils'


const props = defineProps({
  sectionTitle: { type: String, default: 'UNKNOWN SECTION' },
  addDebugMarkers: { type: Boolean, default: false },
  backgroundImage: { type: String, default: '' },
  backgroundColour: { type: String, default: 'transparent' },
  bgShowStartPos: { type: String, default: 'top center' },
  bgShowEndPos: { type: String, default: 'bottom center' },
  fullHeightSection: { type: Boolean, default: false },
})

const sectionEl = ref<HTMLElement | null>(null)
const backgroundEl = ref<HTMLElement | null>(null)

let gsapContext: gsap.Context | null = null
let scrollTrigger: ScrollTriggerInstance | null = null
let resizeObserver: ResizeObserver | null = null

const baseBackgroundColour = computed(() => props.backgroundColour || 'transparent')

const fadeGradient = computed(() => {
  const baseColour = baseBackgroundColour.value
  const colour = colourWithOpacity(baseColour, 1)
  const hasImage = Boolean(props.backgroundImage)

  if (!hasImage) {
    if (colour === 'transparent') {
      return [
        `linear-gradient(
          to bottom,
          transparent 0%,
          transparent 30%,
          transparent 80%,
          transparent 100%
        )`,
      ]
    }

    return [
      `linear-gradient(
        to bottom,
        transparent 0%,
        ${colourWithOpacity(baseColour, 0.3)} 30%,
        ${colourWithOpacity(baseColour, 0.8)} 80%,
        transparent 100%
      )`,
    ]
  }

  const overlayColour = baseColour === 'transparent' ? 'rgba(0, 0, 0, 0.45)' : colourWithOpacity(baseColour, 0.45)

  return [
    `linear-gradient(
      to bottom,
      transparent 0%,
      ${overlayColour} 30%,
      ${overlayColour} 80%,
      transparent 100%
    )`,
  ]
})

const tintedOverlay = computed(() => {
  if (!props.backgroundImage) return null
  const colour = baseBackgroundColour.value
  if (colour === 'transparent') {
    return 'linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45))'
  }

  const overlay = colourWithOpacity(colour, 0.5)
  return `linear-gradient(${overlay}, ${overlay})`
})

const backgroundStyle = computed(() => {
  const layers: string[] = []

  if (tintedOverlay.value) {
    layers.push(tintedOverlay.value)
  }

  layers.push(...fadeGradient.value)

  if (props.backgroundImage) {
    layers.push(`url(${props.backgroundImage})`)
  }

  return {
    backgroundImage: layers.join(','),
  }
})

function colourWithOpacity(colour: string, opacity: number) {
  return resolveCssColor(colour, opacity)
}

const sectionStyle = computed(() => {
  if (!props.fullHeightSection) {
    return undefined
  }
  return { minHeight: '100vh' }
})

onMounted(async () => {
  if (!sectionEl.value || !backgroundEl.value) {
    return
  }

  const ScrollTrigger = await useScrollTrigger()
  if (!ScrollTrigger) {
    return
  }

  gsapContext = gsap.context(() => {
    const instance = ScrollTrigger.create({
      trigger: sectionEl.value,
      start: () => props.bgShowStartPos,
      end: () => props.bgShowEndPos,
      onEnter: () => toggleBackground(true),
      onEnterBack: () => toggleBackground(true),
      onLeave: () => toggleBackground(false),
      onLeaveBack: () => toggleBackground(false),
      markers: props.addDebugMarkers,
    })

    scrollTrigger = instance
    toggleBackground(instance.isActive || instance.progress > 0)
  }, sectionEl.value)

  if (typeof ResizeObserver !== 'undefined' && sectionEl.value) {
    resizeObserver = new ResizeObserver(() => {
      scheduleScrollTriggerRefresh()
    })
    resizeObserver.observe(sectionEl.value)
  }

  scheduleScrollTriggerRefresh()
})

onBeforeUnmount(() => {
  scrollTrigger?.kill()
  scrollTrigger = null
  gsapContext?.revert()
  gsapContext = null
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  () => [props.backgroundImage, props.backgroundColour],
  () => {
    toggleBackground(scrollTrigger?.isActive ?? false)
    scheduleScrollTriggerRefresh()
  },
)

function toggleBackground(isActive: boolean) {
  const target = backgroundEl.value
  if (!target) return

  const hasContent = hasBackgroundContent()
  const shouldShow = hasContent && isActive

  target.classList.toggle('has-content', hasContent)
  target.classList.toggle('is-visible', shouldShow)

  if (!hasContent) {
    target.classList.remove('is-visible')
  }
}

function hasBackgroundContent() {
  return Boolean(props.backgroundImage || props.backgroundColour !== 'transparent')
}

function scheduleScrollTriggerRefresh() {
  if (!scrollTrigger) return

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      scrollTrigger?.refresh()
    })
  } else {
    scrollTrigger.refresh()
  }
}
</script>

<template>
  <section ref="sectionEl"
           style="position: relative; display: flex; align-items: stretch;"
           :style="sectionStyle">
    <div ref="backgroundEl" class="home-page-section__background" :style="backgroundStyle"></div>
    <div class="home-page-section__content">
      <slot />
    </div>
  </section>
</template>

<style scoped>

.home-page-section__background {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 0.50s ease-out;
  pointer-events: none;
  visibility: visible;
  /* Fade the background itself at top/bottom so content never looks overlaid */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 50%, transparent 100%);
}

.home-page-section__background.has-content {
  visibility: visible;
}

.home-page-section__background.is-visible {
  opacity: 1;
}

.home-page-section__content {
  width: 100%;
  display: flex;
  flex-direction: column;
  z-index: 2;
}
</style>
