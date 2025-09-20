<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import SteamDeckConsoleVideo from 'components/elements/SteamDeckConsoleVideo.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'

const videoUrl = new URL('../assets/using-deck-settings-decky-plugin.compressed.mp4', import.meta.url).href
const previewImageUrl = new URL('../assets/using-deck-settings-decky-plugin.compressed.jpg', import.meta.url).href

const videoLoaded = ref(false)

const containerRef = ref<HTMLElement | null>(null)
const cardTextRef = ref<HTMLElement | null>(null)
const mobileVideoRef = ref<HTMLVideoElement | null>(null)
const typingTimer = ref<number | null>(null)
let intersectionObserver: IntersectionObserver | null = null

function setCardTextRef(el: Element | ComponentPublicInstance | null) {
  if (!el) {
    cardTextRef.value = null
    return
  }
  if (el instanceof HTMLElement) {
    cardTextRef.value = el
    return
  }
  cardTextRef.value = ('$el' in el && el.$el instanceof HTMLElement)
    ? el.$el
    : null
}

async function typeNodes(parentEl: HTMLElement, nodes: ChildNode[], speed = 1): Promise<void> {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node as Text).textContent || ''
      for (let i = 0; i < txt.length; i++) {
        parentEl.append(txt[i]!)
        await new Promise<void>(resolve => {
          typingTimer.value = window.setTimeout(() => resolve(), speed)
        })
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const clone = document.createElement(el.tagName)
      for (const { name, value } of Array.from(el.attributes)) {
        clone.setAttribute(name, value)
      }
      parentEl.append(clone)
      await typeNodes(clone, Array.from(el.childNodes), speed)
    }
  }
}

onMounted(() => {
  const initialiseTyping = () => {
    const cardText = cardTextRef.value
    const section = containerRef.value
    if (!cardText || !section) return false

    const paragraphs = Array.from(cardText.querySelectorAll('p'))
    const nodesList = paragraphs.map(p => Array.from(p.childNodes))

    paragraphs.forEach(p => {
      const h = p.getBoundingClientRect().height
      p.style.minHeight = `${h}px`
      p.innerHTML = ''
      p.style.visibility = 'hidden'
    })

    intersectionObserver = new IntersectionObserver((entries, observer) => {
      const entry = entries[0]
      if (entry?.isIntersecting) {
        videoLoaded.value = true
        observer.disconnect()
        ;(async () => {
          for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i]
            p?.style.removeProperty('visibility')
            await typeNodes(p!, nodesList[i]!, 1)
          }
        })()
      }
    }, { threshold: 0.3 })

    intersectionObserver.observe(section)
    return true
  }

  if (!initialiseTyping()) {
    nextTick(() => {
      initialiseTyping()
    })
  }
})

onUnmounted(() => {
  if (typingTimer.value !== null) {
    window.clearTimeout(typingTimer.value)
    typingTimer.value = null
  }
  intersectionObserver?.disconnect()
  intersectionObserver = null
})

function requestMobileFullscreen() {
  const video = mobileVideoRef.value
  if (!video) return

  const vendorVideo = video as HTMLVideoElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
    webkitEnterFullscreen?: () => void
    mozRequestFullScreen?: () => Promise<void>
    msRequestFullscreen?: () => Promise<void>
  }

  try {
    if (video.requestFullscreen) {
      const result = video.requestFullscreen()
      if (result instanceof Promise) {
        result.catch(() => {
        })
      }
      return
    }

    if (vendorVideo.webkitRequestFullscreen) {
      const result = vendorVideo.webkitRequestFullscreen()
      if (result instanceof Promise) {
        result.catch(() => {
        })
      }
      return
    }

    if (vendorVideo.webkitEnterFullscreen) {
      vendorVideo.webkitEnterFullscreen()
      return
    }

    if (vendorVideo.mozRequestFullScreen) {
      const result = vendorVideo.mozRequestFullScreen()
      if (result instanceof Promise) {
        result.catch(() => {
        })
      }
      return
    }

    if (vendorVideo.msRequestFullscreen) {
      const result = vendorVideo.msRequestFullscreen()
      if (result instanceof Promise) {
        result.catch(() => {
        })
      }
    }
  } catch (err) {
    console.warn('Unable to enter fullscreen mode', err)
  }
}
</script>

<template>
  <div ref="containerRef" class="decky-plugin">
    <div v-if="!$q.platform.is.mobile" class="decky-plugin__media" aria-hidden="true">
      <SteamDeckConsoleVideo
        v-if="$q.screen.gt.lg"
        :imageUrl="previewImageUrl"
        :videoUrl="videoUrl"
      />
      <div v-else class="decky-plugin__video-wrapper">
        <video
          width="1200"
          height="800"
          autoplay
          loop
          muted
          playsinline
          preload="none"
          class="decky-plugin__video"
        >
          <source
            v-if="videoLoaded"
            :src="videoUrl"
            type="video/mp4"
          >
        </video>
      </div>
    </div>
    <q-card class="decky-plugin__card">
      <q-card-section class="decky-plugin__card-section" :ref="setCardTextRef">
        <h2 class="text-h3 q-ma-none text-center">
          Browse Game Reports Directly from Your Handheld
        </h2>
        <p>
          Use the <strong><a href="https://github.com/DeckSettings/decky-game-settings"
                             target="_blank" rel="noopener">
          Deck Settings </a></strong>
          plugin for Decky Loader to explore game reports right from your handheld device—whether you’re on a
          <strong>Steam Deck</strong>, <strong>ROG Ally</strong>, <strong>Lenovo Legion Go</strong>,
          or any compatible PC running
          <strong><a href="https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227"
                     target="_blank" rel="noopener">SteamOS</a></strong>,
          <strong><a href="https://cachyos.org/" target="_blank" rel="noopener">CachyOS</a></strong>,
          <strong><a href="https://nobaraproject.org/" target="_blank" rel="noopener">Nobara</a></strong>,
          <strong><a href="https://bazzite.gg/" target="_blank" rel="noopener">Bazzite</a></strong>,
          or similar Linux-based gaming distributions.
          The plugin integrates seamlessly with Steam's Game Mode, giving you instant access to community provided
          guides and notes right in your handheld UI.
        </p>
        <p class="q-mb-none">
          Not only can you view detailed reports for your games, but the plugin also includes embedded
          YouTube video reviews, direct links to <a href="https://steamdeckhq.com/game-settings/"
                                                    target="_blank" rel="noopener">SDHQ</a>
          game settings reviews, and the ability to filter reports by specific devices or view them across all
          supported platforms. Whether you're trying to optimise for battery life or unlock higher FPS, the Deck
          Settings plugin puts this community's knowledge at your fingertips without even needing to exit your
          game.
        </p>
        <div class="full-width row justify-center q-mb-lg q-px-md">
          <div>
            <PrimaryButton
              color="primary"
              full-width
              icon="extension"
              label="Install Deck Settings Plugin"
              :to="{ name: 'decky-plugin' }" />
          </div>
        </div>
      </q-card-section>
      <q-card-section v-if="$q.platform.is.mobile">
        <div class="decky-plugin__mobile-video">
          <video
            ref="mobileVideoRef"
            width="1200"
            height="800"
            autoplay
            loop
            muted
            playsinline
            preload="none"
            class="decky-plugin__video is-mobile"
          >
            <source
              v-if="videoLoaded"
              :src="videoUrl"
              type="video/mp4"
            >
          </video>
          <q-btn
            class="decky-plugin__fullscreen-btn"
            round
            dense
            size="sm"
            icon="fullscreen"
            color="primary"
            @click="requestMobileFullscreen"
          />
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.decky-plugin {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 640px;
  align-items: center;
  margin-top: 0;
  margin-bottom: 50px;
  gap: 1.25rem;
}

.decky-plugin__media {
  display: flex;
  justify-content: center;
  align-items: center;
  order: 1;
  min-width: 200px;
}

.decky-plugin__video-wrapper {
  width: 100%;
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  aspect-ratio: 3 / 2;
}

.decky-plugin__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.decky-plugin__mobile-video {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.decky-plugin__fullscreen-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.decky-plugin__card {
  max-width: 900px;
  z-index: 1000;
  background: color-mix(in srgb, var(--q-dark) 60%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.decky-plugin__card-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.decky-plugin__card a {
  color: var(--q-primary);
  text-decoration-color: color-mix(in srgb, var(--q-primary) 50%, transparent);
}

.decky-plugin__card a:hover {
  text-decoration: underline;
}

@media (min-width: 1024px) {
  .decky-plugin {
    flex-direction: row-reverse;
    margin: 0 100px;
  }
}

@media (min-width: 600px) {
  .decky-plugin {
    gap: 2rem;
  }

  .decky-plugin__card,
  .decky-plugin__media {
    width: 100%;
  }

  .decky-plugin__media {
    max-width: 1300px;
  }
}
</style>
