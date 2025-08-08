<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { CSSProperties } from 'vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()

const props = defineProps({
  backgroundImageUrl: { type: String, default: '' },
  transition: { type: String, default: '1s' },
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
    image: 'https://deckverified.games/deck-verified/devices/valve-steam-deck-shadow.png',
    title: 'Steam Deck (LCD/OLED)',
    description: '...',
  },
  {
    id: 2,
    image: 'https://deckverified.games/deck-verified/devices/asus-rog-ally-shadow.png',
    title: 'ASUS ROG Ally',
    description: '...',
  },
  {
    id: 3,
    image: 'https://deckverified.games/deck-verified/devices/asus-rog-ally-x-shadow.png',
    title: 'ASUS ROG Ally X',
    description: '...',
  },
  {
    id: 4,
    image: 'https://deckverified.games/deck-verified/devices/lenovo-legion-go-shadow.png',
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
  if (!$q.platform.is.mobile) {
    window.addEventListener('scroll', checkScroll)
  }
  checkScroll()
})
onUnmounted(() => {
  if (!$q.platform.is.mobile) {
    window.removeEventListener('scroll', checkScroll)
  }
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
            <h2 class="text-h2 q-mb-md" :class="{'text-h4': $q.screen.lt.md}">
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
            <p>
              Don’t see your device yet? Contributing support is quick and easy.
              Just open a request on GitHub and we'll help you get it added.
            </p>
            <q-btn
              class="q-mb-md"
              icon="fab fa-github"
              href="https://github.com/DeckSettings/deck-verified-site/issues/new?template=NEW-DEVICE.yml"
              target="_blank" rel="noopener"
              label="Request a New Device"
              color="white"
              text-color="black"
              no-caps
              glossy
            />
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
}

.background-image.is-visible {
  opacity: 0.3;
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
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, transparent 5%, var(--q-primary) 30%, var(--q-accent) 70%, transparent 95%);
}

.info-wrapper {
  max-width: 820px;
  margin-left: 48px;
  z-index: 3;
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
  width: 480px;
  z-index: 10;
  transition: opacity 0.1s ease, transform 0.1s ease;
  background: transparent;
  /*color: #333;
  background: #EEE;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  border-radius: 8px;*/
}

.card-image {
  position: relative;
  left: 7%;
  width: 100%;
  object-fit: contain;
}

/* -md- */
@media (max-width: 1024px) {
  .pin-wrapper::before {
    background: linear-gradient(to bottom, transparent, var(--q-accent) 30%, var(--q-primary) 70%, transparent 95%);
  }

  .info-wrapper {
    margin-top: 7vh;
    max-width: 720px;
    margin-left: 10px;
    margin-right: 10px;
  }

  .carousel-wrapper {
    height: 40vh;
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
    margin-top: 7vh;
    max-width: 520px;
  }
}
</style>
