<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import SteamDeckConsoleVideo from 'components/elements/SteamDeckConsoleVideo.vue'

const videoUrl = new URL('../assets/using-deck-settings-decky-plugin.compressed.mp4', import.meta.url).href
const previewImageUrl = new URL('../assets/using-deck-settings-decky-plugin.compressed.jpg', import.meta.url).href
const videoLoaded = ref(false)

const sectionRef = ref<HTMLElement | null>(null)
const textContainerRef = ref<HTMLElement | null>(null)
let typingTimer: number | null = null

async function typeNodes(
  parentEl: HTMLElement,
  nodes: ChildNode[],
  speed = 1,
): Promise<void> {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node as Text).textContent || ''
      for (let i = 0; i < txt.length; i++) {
        parentEl.append(txt[i]!)
        await new Promise(r => typingTimer = window.setTimeout(r, speed))
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
  const container = textContainerRef.value
  if (!container) return

  const paragraphs = Array.from(container.querySelectorAll('p'))
  const nodesList = paragraphs.map(p => Array.from(p.childNodes))

  paragraphs.forEach(p => {
    const h = p.getBoundingClientRect().height
    p.style.minHeight = `${h}px`
    p.innerHTML = ''
    p.style.visibility = 'hidden'
  })

  const obs = new IntersectionObserver((entries, observer) => {
    if (entries[0]?.isIntersecting) {
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
  }, { threshold: 0.5 })

  obs.observe(container)
})

onUnmounted(() => {
  if (typingTimer) window.clearInterval(typingTimer)
})
</script>

<template>
  <div ref="sectionRef" class="device-section">
    <div class="pin-wrapper">
      <div class="split-container row items-center q-col-gutter-xl">
        <div class="video-col col-12 col-md-6 col-lg-8">
          <SteamDeckConsoleVideo
            v-if="!$q.screen.lt.lg"
            :imageUrl="previewImageUrl"
            :videoUrl="videoUrl"
          />
          <div v-else class="video-wrapper">
            <video
              width="1200"
              height="800"
              autoplay
              loop
              muted
              playsinline
              preload="none"
              class="video-content"
            >
              <source
                v-if="videoLoaded"
                :src="videoUrl"
                type="video/mp4" />
            </video>
          </div>
        </div>

        <div class="text-col col-12 col-md-6 col-lg-4">
          <div class="text-panel" ref="textContainerRef">
            <h2 class="text-h2 q-mb-md q-mt-none" :class="{'text-h4': $q.screen.lt.md}">
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
            <p>
              Not only can you view detailed reports for your games, but the plugin also includes embedded
              YouTube video reviews, direct links to <a href="https://steamdeckhq.com/game-settings/"
                                                        target="_blank" rel="noopener">SDHQ</a>
              game settings reviews, and the ability to filter reports by specific devices or view them across all
              supported platforms. Whether you're trying to optimise for battery life or unlock higher FPS, the Deck
              Settings plugin puts this community's knowledge at your fingertips without even needing to exit your
              game.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-section {
  height: 100vh;
  padding: 0 1.5rem;
  box-sizing: border-box;
}

.pin-wrapper {
  position: sticky;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  display: flex;
  justify-content: center;
}

.split-container {
  width: 100%;
  max-width: 2000px;
}

.text-col {
  justify-content: center;
}

.video-wrapper {
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.video-content {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text-panel {
  width: 100%;
  text-align: left;
  box-sizing: border-box;
  padding: 20px 24px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--q-dark) 60%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.text-panel a {
  color: var(--q-primary);
  text-decoration-color: color-mix(in srgb, var(--q-primary) 50%, transparent);
}

.text-panel a:hover {
  text-decoration: underline;
}

/* -sm- */
@media (max-width: 600px) {
  .device-section {
    padding: 0 0.1rem;
  }

  .text-panel {
    padding: 16px 18px;
    text-align: center;
  }
}
</style>
