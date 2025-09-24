<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { gsap } from 'gsap'
import { getLoadedScrollTrigger, useScrollTrigger } from 'src/composables/useScrollTrigger'
import DeviceImage from 'components/elements/DeviceImage.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'

type DeviceItem = {
  device: string
  width: number
  top: number
  left?: string
  right?: string
  scrollSpeed?: number
  enter?: {
    side?: 'left' | 'right'
    offset?: number
    ease?: string
    duration?: number
  }
  appearOffset?: number
  opacity?: number
  rotate?: number
}

const DEVICE_ITEMS: DeviceItem[] = [
  {
    device: 'Steam Deck LCD (256GB/512GB)',
    width: 100,
    top: 20,
    left: '30%',
    scrollSpeed: 10,
    enter: { side: 'left', offset: 200, ease: 'power3.out' },
    appearOffset: 0,
    opacity: 1,
    rotate: 0,
  },
  {
    device: 'ROG Ally Z1 Extreme',
    width: 400,
    top: 280,
    right: '20%',
    scrollSpeed: 40,
    enter: { side: 'right', offset: 250, ease: 'power3.out' },
    appearOffset: 200,
    opacity: 1,
    rotate: 0,
  },
  {
    device: 'Legion Go',
    width: 140,
    top: 300,
    left: '12%',
    scrollSpeed: 14,
    enter: { side: 'right', offset: 400, ease: 'power3.out' },
    appearOffset: 420,
    opacity: 1,
    rotate: 0,
  },
  {
    device: 'ROG Ally X',
    width: 150,
    top: 520,
    right: '10%',
    scrollSpeed: 15,
    enter: { side: 'left', offset: 120, ease: 'power3.out' },
    appearOffset: 640,
    opacity: 1,
    rotate: 0,
  },
  {
    device: 'Zone',
    width: 150,
    top: 720,
    right: '28%',
    scrollSpeed: 15,
    enter: { side: 'right', offset: 140, ease: 'power3.out' },
    appearOffset: 740,
    opacity: 1,
    rotate: 0,
  },
  {
    device: 'Steam Deck OLED',
    width: 300,
    top: 820,
    left: '-8%',
    scrollSpeed: 30,
    enter: { side: 'left', offset: 140, ease: 'power3.out' },
    appearOffset: 840,
    opacity: 1,
    rotate: 0,
  },
]

const containerRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const deviceRefs = ref<(HTMLElement | null)[]>([])
const scaleFactor = ref(1)

type GSAPContext = ReturnType<typeof gsap.context>
let ctx: GSAPContext | null = null
let scrollTriggerPlugin = getLoadedScrollTrigger()

function setDeviceRef(el: Element | ComponentPublicInstance | null, index: number) {
  deviceRefs.value[index] = el instanceof HTMLElement ? el : null
}

const cardTravelPx = 64
const SCALE_BREAKPOINT = 1024
const MIN_WIDTH_FACTOR = 1
const MAX_WIDTH_FACTOR = 1.7

function calculateScaleFactor(width: number) {
  if (width < SCALE_BREAKPOINT) {
    return MIN_WIDTH_FACTOR
  }

  const ratio = width / SCALE_BREAKPOINT
  return Math.min(MAX_WIDTH_FACTOR, Math.max(MIN_WIDTH_FACTOR, ratio))
}

function updateScaleFactor() {
  if (typeof window === 'undefined') return
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth
  scaleFactor.value = calculateScaleFactor(viewportWidth)
  scrollTriggerPlugin?.refresh()
}

function getDeviceWidth(item: DeviceItem) {
  const computedWidth = Math.round(item.width * scaleFactor.value)
  return `${computedWidth}px`
}

onMounted(async () => {
  scrollTriggerPlugin = await useScrollTrigger({ withCSS: true })
  if (!scrollTriggerPlugin) return

  const scope = containerRef.value
  if (!scope) return

  updateScaleFactor()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateScaleFactor)
  }

  ctx = gsap.context(() => {
    const trigger = scope

    const cardEl = cardRef.value

    if (cardEl) {
      gsap.fromTo(cardEl, {
        y: -(cardTravelPx / 2),
      }, {
        y: cardTravelPx / 2,
        ease: 'none',
        scrollTrigger: {
          trigger,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      })
    }

    deviceRefs.value.forEach((deviceEl, index) => {
      if (!deviceEl) return
      const config = DEVICE_ITEMS[index]
      if (!config) return

      const speed = config.scrollSpeed ?? 2
      const travel = cardTravelPx * speed
      const cardHeight = cardEl?.offsetHeight ?? 0
      const crossoverDistance = (cardHeight / 2) + (travel / 2)
      const enterConfig = config.enter ?? {}
      const baseOpacity = config.opacity ?? 0.35
      const entryOffset = Math.abs(enterConfig.offset ?? 200)
      const entrySide = enterConfig.side ?? 'left'
      const entryFromX = entrySide === 'right' ? entryOffset : -entryOffset
      const entryEase = enterConfig.ease ?? 'power3.out'
      const entryDuration = enterConfig.duration ?? 0.9
      const appearOffset = config.appearOffset ?? (index * 200)
      const appearStart = () => `top+=${Math.round(appearOffset)}px bottom`

      gsap.set(deviceEl, {
        rotate: config.rotate ?? 0,
        x: entryFromX,
        opacity: 0,
        y: crossoverDistance,
      })

      gsap.to(deviceEl, {
        x: 0,
        opacity: baseOpacity,
        duration: entryDuration,
        ease: entryEase,
        scrollTrigger: {
          trigger,
          start: appearStart,
          toggleActions: 'play none none reverse',
        },
      })

      gsap.fromTo(deviceEl, {
        y: crossoverDistance,
      }, {
        y: -crossoverDistance,
        ease: 'none',
        scrollTrigger: {
          trigger,
          start: appearStart,
          end: 'bottom top',
          scrub: true,
        },
        immediateRender: false,
      })
    })
  }, scope)
})

onBeforeUnmount(() => {
  ctx?.revert()
  ctx = null
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateScaleFactor)
  }
})

function getDeviceStyle(item: DeviceItem) {
  return {
    top: `${item.top}px`,
    left: item.left,
    right: item.right,
    zIndex: Math.max(1, Math.round((item.width ?? 0) / 10)),
    opacity: item.opacity ?? 0.3,
  }
}
</script>

<template>
  <div ref="containerRef" class="supported-devices">
    <div class="supported-devices__device-layer" aria-hidden="true">
      <div
        v-for="(item, index) in DEVICE_ITEMS"
        :key="index"
        class="supported-devices__device"
        :style="getDeviceStyle(item)"
        :ref="el => setDeviceRef(el, index)"
      >
        <DeviceImage
          :device="item.device"
          :width="getDeviceWidth(item)"
          size="large"
          drop-shadow
        />
      </div>
    </div>
    <q-card class="supported-devices__card">
      <q-card-section>
        <h2 class="text-h3 q-ma-none text-center">
          Devices Available for Community Reporting
        </h2>
      </q-card-section>
      <q-card-section>
        <div ref="cardRef">
          <p>
            This open-source GitHub project hosts a database of community-submitted handheld PC game reports for devices
            like the <strong>Steam Deck</strong>, <strong>ASUS ROG Ally</strong> and <strong>Lenovo Legion Go</strong>.
            Whether you’re looking for settings that improve performance and battery life, or you want to share your own
            optimized configurations, you’re in the right place.
          </p>
          <p>
            Each game report can include performance tweaks such as TDP limits, VRR and frame-rate caps, GPU clock
            adjustments, undervolting, and more. They also provide guidance on in-game graphics and
            display settings, including resolution choices, FSR or XeSS upscaling, frame generation and texture
            quality. Detailed compatibility notes can include links to YouTube video guides if you wish. Finally,
            estimated battery life and total play time are calculated based on the report data.
          </p>
          <p>
            If your device isn’t listed yet, adding support is simple. Just open a request on GitHub and we’ll help you
            get it included.
          </p>
          <div class="full-width row justify-center q-mb-lg q-px-md">
            <div>
              <PrimaryButton
                color="primary"
                full-width
                icon="fab fa-github"
                label="Request a New Device"
                href="https://github.com/DeckSettings/deck-verified-site/issues/new?template=NEW-DEVICE.yml"
                target="_blank" rel="noopener">
                <q-tooltip>View on ProtonDB</q-tooltip>
              </PrimaryButton>
            </div>
          </div>
          <p class="q-mb-lg">
            Once approved, your device will appear in the list—ready for game reports, performance data, and settings
            shared by the community.
          </p>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.supported-devices {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 640px;
  align-items: center;
  margin-top: 0;
  margin-bottom: 50px;
}

.supported-devices__device-layer {
  position: absolute;
  inset: 0;
  overflow: visible;
  z-index: 0;
  pointer-events: none;
}

.supported-devices__device {
  position: absolute;
  transform-origin: center;
  will-change: transform;
}

.supported-devices__card {
  position: relative;
  max-width: 900px;
  width: 100%;
  z-index: 1000;
  background: color-mix(in srgb, var(--q-dark) 60%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

@media (min-width: 1024px) {
  .supported-devices {
    align-items: flex-start;
    margin-left: 100px;
    margin-top: 200px;
    margin-bottom: 300px;
  }
}
</style>
