<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'

// Default frame image (front-facing Steam Deck)
import defaultFrame from '../../assets/steamdeck-front-facing.png'

const props = withDefaults(defineProps<{
  videoUrl: string
  posterUrl?: string
  frameUrl?: string
  // Preferred: pixel rectangle of the transparent window in the native frame asset
  screenLeftPx?: number
  screenTopPx?: number
  screenWidthPx?: number
  screenHeightPx?: number
  // Fallback: percentages (used only if px cannot be resolved)
  screenLeftPct?: number
  screenTopPct?: number
  screenWidthPct?: number
  screenHeightPct?: number
  // Scroll band around viewport center where video plays
  centerBandRatio?: number
  minScale?: number
  maxScale?: number
}>(), {
  frameUrl: defaultFrame,
  // Defaults supplied by user for the provided asset
  screenLeftPx: 428,
  screenTopPx: 61,
  screenWidthPx: 982,
  screenHeightPx: 614,
  // Fallback pct values
  screenLeftPct: 37.0,
  screenTopPct: 7.0,
  screenWidthPct: 39.2,
  screenHeightPct: 80.0,
  centerBandRatio: 0.18,
  minScale: 0.92,
  maxScale: 1.0,
})

const containerRef = ref<HTMLElement | null>(null)
const frameRef = ref<HTMLElement | null>(null)
const frameImgRef = ref<HTMLImageElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)

const scale = ref(props.minScale)
const showVideo = ref(false)

const effectivePoster = ref<string | undefined>(props.posterUrl)
const effectiveVideo = ref<string>(props.videoUrl)
const effectiveFrame = ref<string>(props.frameUrl)
const frameNaturalW = ref<number | null>(null)
const frameNaturalH = ref<number | null>(null)

function throttle<T extends (...a: unknown[]) => void>(fn: T, wait = 20): T {
  let last = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= wait) {
      last = now
      fn(...args)
    }
  }) as T
}

const onScroll = throttle(() => {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight

  // scale toward center
  const transition = (vh + rect.height) / 2
  let progress = (vh - rect.top) / transition
  progress = Math.min(Math.max(progress, 0), 1)
  scale.value = props.minScale + (props.maxScale - props.minScale) * progress

  // center band playback
  const centerY = vh / 2
  const elemCenter = rect.top + rect.height / 2
  const inBand = Math.abs(elemCenter - centerY) <= vh * props.centerBandRatio
  if (inBand) {
    if (!showVideo.value) {
      showVideo.value = true
      if (videoEl.value) {
        videoEl.value.currentTime = 0
        void videoEl.value.play().catch(() => {
        })
      }
    }
  } else {
    if (showVideo.value) {
      showVideo.value = false
      if (videoEl.value) videoEl.value.pause()
    }
  }
}, 20)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', onScroll)
    onScroll()
  }
  // Measure the native frame dimensions when available
  const img = frameImgRef.value
  if (img) {
    if (img.complete && img.naturalWidth && img.naturalHeight) {
      frameNaturalW.value = img.naturalWidth
      frameNaturalH.value = img.naturalHeight
    } else {
      img.addEventListener('load', () => {
        frameNaturalW.value = img.naturalWidth
        frameNaturalH.value = img.naturalHeight
      }, { once: true })
    }
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', onScroll)
  }
})

watch(() => props.videoUrl, v => {
  effectiveVideo.value = v
})
watch(() => props.posterUrl, p => {
  effectivePoster.value = p
})
watch(() => props.frameUrl, f => {
  effectiveFrame.value = f || defaultFrame
})

const screenStyle = computed(() => {
  const w = frameNaturalW.value
  const h = frameNaturalH.value
  if (
    w && h &&
    props.screenLeftPx != null && props.screenTopPx != null &&
    props.screenWidthPx != null && props.screenHeightPx != null
  ) {
    return {
      left: `${(props.screenLeftPx / w) * 100}%`,
      top: `${(props.screenTopPx / h) * 100}%`,
      width: `${(props.screenWidthPx / w) * 100}%`,
      height: `${(props.screenHeightPx / h) * 100}%`,
    }
  }
  // Fallback to pct props
  return {
    left: `${props.screenLeftPct}%`,
    top: `${props.screenTopPct}%`,
    width: `${props.screenWidthPct}%`,
    height: `${props.screenHeightPct}%`,
  }
})
</script>

<template>
  <div ref="containerRef" class="sdk-console-wrapper">
    <div class="sdk-console" :style="{ transform: `scale(${scale})` }">
      <div
        ref="frameRef"
        class="sdk-screen"
        :style="screenStyle"
      >
        <img v-if="!showVideo && effectivePoster" :src="effectivePoster" class="fill" alt="Preview" />
        <video v-else ref="videoEl" class="fill" :src="effectiveVideo" muted playsinline />
      </div>
      <img ref="frameImgRef" class="sdk-frame" :src="effectiveFrame" alt="Steam Deck" />
    </div>
  </div>

</template>

<style scoped>
.sdk-console-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}

.sdk-console {
  position: relative;
  max-width: 1500px;
  width: 100%;
  transform-origin: center center;
  transition: transform 0.2s ease-out;
  filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.45));
}

.sdk-frame {
  width: 100%;
  display: block;
}

.sdk-screen {
  position: absolute;
  overflow: hidden;
}

.fill {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
