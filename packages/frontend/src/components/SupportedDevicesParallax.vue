<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { gsap } from 'gsap'
import { refreshScrollTrigger, useScrollTrigger } from 'src/composables/useScrollTrigger'
import DeviceImage from 'components/elements/DeviceImage.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()

type TweenVars = Record<string, unknown>
type ScrollTriggerVars = Record<string, unknown>
type YTweenValue = number | string | (() => number)

type DeviceParallaxItem = {
  device: string
  width?: number
  grid: {
    columnStart: number
    columnSpan: number
    rowStart: number
    rowSpan: number
  }
  zIndex?: number
  entrance?: {
    from?: TweenVars
    to?: TweenVars
    scroll?: ScrollTriggerVars
  }
  parallax?: {
    amount?: number | string
    speed?: number
    scroll?: ScrollTriggerVars
  }
}

const DEVICE_ITEMS: DeviceParallaxItem[] = [
  {
    device: 'Steam Deck LCD (256GB/512GB)',
    width: 420,
    grid: { columnStart: 2, columnSpan: 4, rowStart: 2, rowSpan: 4 },
    zIndex: 110,
    entrance: {
      from: { x: 160, opacity: 0, filter: 'blur(6px)', scale: 0.94 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power3.out' },
      scroll: { start: 'top 85%', end: 'top 60%', scrub: true },
    },
    parallax: {
      speed: 0.22,
      scroll: { start: 'top bottom', end: 'bottom top', scrub: true },
    },
  },
  {
    device: 'ROG Ally Z1 Extreme',
    width: 440,
    grid: { columnStart: 7, columnSpan: 4, rowStart: 4, rowSpan: 4 },
    zIndex: 130,
    entrance: {
      from: { x: 200, opacity: 0, filter: 'blur(8px)', scale: 0.9 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power3.out' },
      scroll: { start: 'top 82%', end: 'top 58%', scrub: true },
    },
    parallax: {
      speed: 0.34,
      scroll: { start: 'top 95%', end: 'bottom top', scrub: true },
    },
  },
  {
    device: 'Legion Go',
    width: 430,
    grid: { columnStart: 3, columnSpan: 4, rowStart: 7, rowSpan: 4 },
    zIndex: 100,
    entrance: {
      from: { x: 140, opacity: 0, filter: 'blur(6px)', scale: 0.92 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power2.out' },
      scroll: { start: 'top 78%', end: 'top 55%', scrub: true },
    },
    parallax: {
      speed: 0.18,
      scroll: { start: 'top bottom', end: 'bottom top', scrub: true },
    },
  },
  {
    device: 'ROG Ally X',
    width: 420,
    grid: { columnStart: 4, columnSpan: 4, rowStart: 11, rowSpan: 4 },
    zIndex: 150,
    entrance: {
      from: { x: 120, opacity: 0, filter: 'blur(6px)', scale: 0.9 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power3.out' },
      scroll: { start: 'top 80%', end: 'top 58%', scrub: true },
    },
    parallax: {
      speed: 0.4,
      scroll: { start: 'top bottom', end: 'bottom top', scrub: true },
    },
  },
  {
    device: 'Zone',
    width: 380,
    grid: { columnStart: 6, columnSpan: 4, rowStart: 16, rowSpan: 4 },
    zIndex: 90,
    entrance: {
      from: { x: 120, opacity: 0, filter: 'blur(6px)', scale: 0.92 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power2.out' },
      scroll: { start: 'top 82%', end: 'top 60%', scrub: true },
    },
    parallax: {
      speed: 1.22,
      scroll: { start: 'top bottom', end: 'bottom top', scrub: true },
    },
  },
  {
    device: 'Steam Deck OLED',
    width: 440,
    grid: { columnStart: 7, columnSpan: 4, rowStart: 13, rowSpan: 4 },
    zIndex: 140,
    entrance: {
      from: { x: 160, opacity: 0, filter: 'blur(8px)', scale: 0.94 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power3.out' },
      scroll: { start: 'top 84%', end: 'top 62%', scrub: true },
    },
    parallax: {
      speed: 0.3,
      scroll: { start: 'top bottom', end: 'bottom top', scrub: true },
    },
  },
  {
    device: 'Legion Go S',
    width: 360,
    grid: { columnStart: 9, columnSpan: 3, rowStart: 8, rowSpan: 4 },
    zIndex: 120,
    entrance: {
      from: { x: 140, opacity: 0, filter: 'blur(8px)', scale: 0.9 },
      to: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'power2.out' },
      scroll: { start: 'top 82%', end: 'top 64%', scrub: true },
    },
    parallax: {
      speed: 0.26,
      scroll: { start: 'top 90%', end: 'bottom top', scrub: true },
    },
  },
]

const devices = computed<DeviceParallaxItem[]>(() => DEVICE_ITEMS)

const sectionRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const figureRefs = ref<(HTMLElement | null)[]>([])

const hasMounted = ref(false)

type GSAPContext = ReturnType<typeof gsap.context>

let ctx: GSAPContext | null = null
let resizeObserver: ResizeObserver | null = null
let isInitializing = false

function setFigureRef(el: Element | ComponentPublicInstance | null, index: number) {
  figureRefs.value[index] = el instanceof HTMLElement ? el : null
}

function getDeviceWidth(item: DeviceParallaxItem) {
  if (item.width) {
    return `${item.width}px`
  }

  const base = Math.min(600, Math.max(340, $q.screen.width * 0.42))
  return `${Math.round(base)}px`
}

function getGridStyle(item: DeviceParallaxItem) {
  return {
    gridColumn: `${item.grid.columnStart} / span ${item.grid.columnSpan}`,
    gridRow: `${item.grid.rowStart} / span ${item.grid.rowSpan}`,
    zIndex: String(item.zIndex ?? 100),
  }
}

function applyParallaxAnimations(section: HTMLElement) {
  figureRefs.value.forEach((el, index) => {
    if (!el) return
    const config = devices.value[index]
    if (!config) return

    if (config.parallax) {
      const { amount: amountSetting, speed: speedSetting, scroll: parallaxScroll } = config.parallax
      let yValue: YTweenValue = '-20vh'

      if (amountSetting !== undefined) {
        yValue = amountSetting
      } else if (typeof speedSetting === 'number') {
        const speed = speedSetting
        yValue = () => -(window.innerHeight * speed)
      }
      const parallaxTrigger: ScrollTriggerVars = {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
        ...parallaxScroll,
      }

      gsap.to(el, {
        y: yValue,
        ease: 'none',
        scrollTrigger: parallaxTrigger,
      })
    }

    if (config.entrance) {
      const fromVars: TweenVars = config.entrance.from ?? { x: 140, opacity: 0, filter: 'blur(6px)', scale: 0.94 }
      const toVars: TweenVars = {
        x: 0,
        opacity: 1,
        filter: 'blur(0px)',
        scale: 1,
        ease: 'power2.out',
        ...config.entrance.to,
      }

      const scrollVars: ScrollTriggerVars = {
        trigger: el,
        start: 'top 85%',
        end: 'top 60%',
        scrub: true,
        invalidateOnRefresh: true,
        ...config.entrance.scroll,
      }

      gsap.fromTo(el, fromVars, {
        ...toVars,
        scrollTrigger: scrollVars,
      })
    }
  })
}

function scheduleScrollTriggerRefresh() {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      void refreshScrollTrigger()
    })
  } else {
    void refreshScrollTrigger()
  }
}

async function initAnimations() {
  if (isInitializing) return
  isInitializing = true

  if (!await useScrollTrigger()) {
    isInitializing = false
    return
  }

  const section = sectionRef.value
  const grid = gridRef.value

  if (!section || !grid) {
    isInitializing = false
    return
  }

  ctx?.revert()
  resizeObserver?.disconnect()
  resizeObserver = null

  await nextTick()
  figureRefs.value.length = devices.value.length

  ctx = gsap.context(() => {
    applyParallaxAnimations(section)

    resizeObserver = new ResizeObserver(() => {
      scheduleScrollTriggerRefresh()
    })
    resizeObserver.observe(grid)
  }, section)

  if (document.readyState === 'complete') {
    scheduleScrollTriggerRefresh()
  } else {
    const loadHandler = () => {
      scheduleScrollTriggerRefresh()
      window.removeEventListener('load', loadHandler)
    }
    window.addEventListener('load', loadHandler)
  }

  isInitializing = false
}

onMounted(async () => {
  hasMounted.value = true
  await initAnimations()
})

onUnmounted(() => {
  ctx?.revert()
  ctx = null
  resizeObserver?.disconnect()
  resizeObserver = null
  hasMounted.value = false
  figureRefs.value = []
})

watch(
  () => $q.screen.width,
  () => {
    scheduleScrollTriggerRefresh()
  },
)
</script>

<template>
  <section ref="sectionRef" class="supported-devices-parallax">
    <div class="overlay">
      <div class="overlay-card">
        <h2 class="header-text q-mb-md q-mt-none">
          Devices Available for Community Reporting
        </h2>
        <p>
          This open-source GitHub reporting project powers a PC handheld game reports database for devices such as
          the <strong>Steam Deck</strong>, <strong>ASUS ROG Ally</strong> and <strong>Lenovo Legion Go</strong>.
          Whether you’re hunting for settings that deliver smoother performance or longer battery life, or you want
          to record and share your own optimised configurations, you’ve come to the right place.
        </p>
        <p>
          Game reports for a device can include performance tweaks such as TDP limits, VRR and frame-rate caps,
          manual GPU-clock adjustments, undervolting and more. They also provide guidance on in-game graphics and
          display settings, including resolution choices, FSR or XeSS upscaling, frame generation and texture
          quality. Detailed compatibility notes can include links to YouTube video guides if you wish. Finally,
          estimated battery life and total play time are calculated based on the report data.
        </p>
        <p class="q-mb-none">
          Don’t see your device yet? Contributing support is quick and easy.
          Just open a request on GitHub and we'll help you get it added.
        </p>
        <div class="q-px-xl">
          <PrimaryButton
            color="primary"
            full-width
            icon="fab fa-github"
            label="Request a New Device"
            href="https://github.com/DeckSettings/deck-verified-site/issues/new?template=NEW-DEVICE.yml"
            target="_blank" rel="noopener">
            <q-tooltip>Request via GitHub</q-tooltip>
          </PrimaryButton>
        </div>
        <p>
          Once approved, your device will appear in the list—ready for game reports, performance data, and settings
          shared by the community.
        </p>
      </div>
    </div>

    <div ref="gridRef" class="underlay-grid">
      <figure
        v-for="(item, index) in devices"
        :key="item.device"
        class="parallax-item"
        :style="getGridStyle(item)"
        :ref="el => setFigureRef(el, index)"
      >
        <DeviceImage
          :device="item.device"
          :dropShadow="true"
          size="large"
          :width="getDeviceWidth(item)" />
      </figure>
    </div>
  </section>
</template>

<style scoped>
.supported-devices-parallax {
  position: relative;
  isolation: isolate;
  padding-block: 12vh;
}

.underlay-grid {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: min(1600px, 95vw);
  margin-inline: auto;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: clamp(56px, 6.5vw, 120px);
  gap: 24px;
  min-height: 200vh;
  margin-top: -70vh;
  padding-top: 70vh;
}

.parallax-item {
  width: 100%;
  height: 100%;
  will-change: transform, opacity, filter;
  transform-origin: center;
}

.parallax-item :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.overlay {
  position: relative;
  z-index: 2;
  max-width: min(1100px, 94vw);
  margin: 0 auto 48px auto;
}

.overlay-card {
  pointer-events: auto;
  padding: 24px 28px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--q-dark) 58%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

@media (max-width: 1023.98px) {
  .supported-devices-parallax {
    padding-block: 8vh;
  }

  .overlay {
    margin: 0 auto 32px auto;
  }

  .overlay-card {
    width: 96vw;
    padding: 20px;
  }
}
</style>
