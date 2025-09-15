<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { CSSProperties } from 'vue'
import { useQuasar } from 'quasar'
import PrimaryButton from 'components/elements/PrimaryButton.vue'

const baseUrl = ref((`${import.meta.env.BASE_URL ?? ''}`).replace(/^\/$/, '').replace(/\/$/, ''))
const $q = useQuasar()

const props = defineProps({
  backgroundImageUrl: { type: String, default: '' },
  transition: { type: String, default: '1s' },
  // Minimum viewport height to enable scroll-driven animation
  minViewportHeight: { type: Number, default: 680 },
})

interface Slide {
  id: number
  image: string
  title: string
  description: string
}

interface SlideStyle extends CSSProperties {
  opacity: number
  transform: string
}

type SlideStylesMap = Record<number, SlideStyle>

const slides = ref<Slide[]>([
  {
    id: 1,
    image: `${baseUrl.value}/devices/valve-steam-deck-shadow.png`,
    title: 'Steam Deck (LCD/OLED)',
    description: '...',
  },
  {
    id: 2,
    image: `${baseUrl.value}/devices/asus-rog-ally-shadow.png`,
    title: 'ASUS ROG Ally',
    description: '...',
  },
  {
    id: 3,
    image: `${baseUrl.value}/devices/asus-rog-ally-x-shadow.png`,
    title: 'ASUS ROG Ally X',
    description: '...',
  },
  {
    id: 4,
    image: `${baseUrl.value}/devices/lenovo-legion-go-shadow.png`,
    title: 'Lenovo Legion Go',
    description: '...',
  },
])

const bgStyle = computed(() => {
  const layers = []
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

const sectionRef = ref<HTMLElement | null>(null)
const scrollY = ref(0)
const windowHeight = ref(0)
const isBackgroundVisible = ref(false)

const SCALE_AMOUNT = 0.1  // shrink by up to 10%
const SPEED = 1.9

const slideStyles = computed<SlideStylesMap>(() => {
  const styles: SlideStylesMap = {}
  const vh = windowHeight.value
  const halfV = vh / 2
  const top = sectionRef.value?.offsetTop ?? 0

  // 1) compute relative scroll so 0 = pin point
  const relY = (scrollY.value - (top - halfV)) * SPEED

  // 2) which “slide window” are we in?
  const idx = Math.floor(relY / vh)
  const prog = ((relY % vh) + vh) % vh / vh

  slides.value.forEach((_, i) => {
    if (i === idx) {
      // slide-in at full opacity
      const p = Math.min(Math.max(prog, 0), 1)
      styles[i] = {
        opacity: 1,
        transform: `translateX(${vh * (1 - p)}px) scale(1)`,
      }
    } else if (i === idx - 1) {
      // fade & shrink out
      const p = Math.min(Math.max(prog, 0), 1)
      styles[i] = {
        opacity: 1 - p,
        transform: `translateX(0) scale(${1 - p * SCALE_AMOUNT})`,
      }
    } else if (relY >= (i + 1) * vh) {
      // done
      styles[i] = { opacity: 0, transform: `translateX(0) scale(1)` }
    } else {
      // not done yet
      styles[i] = { opacity: 0, transform: `translateX(${vh}px) scale(1)` }
    }
  })

  return styles
})

const checkScroll = () => {
  if (!sectionRef.value) return

  const rect = sectionRef.value.getBoundingClientRect()
  scrollY.value = window.scrollY
  windowHeight.value = window.innerHeight

  // Show the background if any part of the section is in the viewport
  isBackgroundVisible.value = rect.bottom > 0 && rect.top < windowHeight.value
}

onMounted(() => {
  const bindOrUnbindScroll = () => {
    const tallEnough = window.innerHeight >= (props.minViewportHeight || 0)
    const shouldBind = tallEnough
    // ensure we don't double-bind
    window.removeEventListener('scroll', checkScroll)
    if (shouldBind) {
      window.addEventListener('scroll', checkScroll)
    }
    // Run once to set initial state
    checkScroll()
  }

  bindOrUnbindScroll()
  window.addEventListener('resize', bindOrUnbindScroll)
  window.addEventListener('orientationchange', bindOrUnbindScroll)
})
onUnmounted(() => {
  window.removeEventListener('scroll', checkScroll)
  window.removeEventListener('resize', () => {
  })
  window.removeEventListener('orientationchange', () => {
  })
})
</script>

<template>
  <section
    ref="sectionRef"
    class="device-section"
    :style="{ height: `${slides.length * 100}vh` }"
  >
    <div
      class="background-image"
      :class="{ 'is-visible': isBackgroundVisible }"
      :style="bgStyle"
    />

    <div class="pin-wrapper">
      <div class="row items-center justify-center" style="width:100%">
        <div class="col-12 col-md-6 flex items-center justify-center">
          <div class="info-wrapper" :class="{'text-center': $q.screen.lt.sm}">
            <h2 class="text-h2 q-mb-md q-mt-none" :class="{'text-h4': $q.screen.lt.md}">
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
                <q-tooltip>View on ProtonDB</q-tooltip>
              </PrimaryButton>
            </div>
            <p>
              Once approved, your device will appear in the list—ready for game reports, performance data, and settings
              shared by the community.
            </p>
          </div>
        </div>

        <div class="col-12 col-md-6 flex items-center justify-center">
          <div class="carousel-wrapper">

            <q-card
              v-for="(slide, i) in slides"
              :key="slide.id"
              class="carousel-card"
              :style="slideStyles[i]"
              flat>
              <img
                :src="slide.image"
                alt=""
                class="card-image"
                loading="lazy"
              />

              <!--<q-card-section>
                    <div class="text-h6">{{ slide.title }}</div>
                  </q-card-section>-->
            </q-card>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
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
  transition: opacity 0.5s ease-in-out;
  /* Fade the background itself at top/bottom so content never looks overlaid */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
}

.background-image.is-visible {
  opacity: 0.24;
}

.device-section {
  position: relative;
  padding-block-start: 50vh;
  padding-block-end: 10vh;
}

.pin-wrapper {
  position: sticky;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  z-index: 3;
}

.pin-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
}

.info-wrapper {
  max-width: 840px;
  margin-left: 40px;
  z-index: 3;
  padding: 20px 24px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--q-dark) 60%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.carousel-wrapper {
  position: relative;
  width: 100%;
  height: 70vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}


.carousel-card {
  position: absolute;
  width: 520px;
  max-width: 100%;
  z-index: 10;
  transition: opacity 0.1s ease, transform 0.1s ease;
  background: transparent;
}

.card-image {
  position: relative;
  left: 4%;
  width: 100%;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
}

/* -md- */
@media (max-width: 1024px) {
  .pin-wrapper::before {
    /*background: radial-gradient(90% 70% at 50% 20%, rgba(0, 0, 0, 0.35), transparent 70%),
    linear-gradient(to right, var(--q-dark) 0%, transparent 20%, transparent 80%, var(--q-dark) 100%),
    linear-gradient(to top, var(--q-dark) 0%, transparent 40%);*/
  }

  .info-wrapper {
    margin-top: 6vh;
    max-width: 760px;
    margin-inline: 10px;
    padding: 16px 18px;
  }

  .carousel-wrapper {
    height: 48vh;
  }
}

/* -steam deck- */
@media (max-width: 855px) {
  .device-section {
    padding-block-start: 100vh;
    padding-block-end: 10vh;
  }
}

/* -sm- */
@media (max-width: 600px) {
  .device-section {
    padding-block-start: 70vh;
    padding-block-end: 10vh;
  }

  .info-wrapper {
    margin-top: 5vh;
    max-width: 560px;
    padding: 14px 16px;
  }
}
</style>
