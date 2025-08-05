<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import videoSrc from '../assets/using-deck-settings-decky-plugin.compressed.mp4'

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
      <div class="split-container">

        <div class="video-col">
          <div class="video-wrapper">
            <video
              width="1200"
              height="800"
              autoplay
              loop
              muted
              playsinline
              class="video-content"
            >
              <source :src="videoSrc" type="video/mp4" />
            </video>
          </div>
        </div>

        <div class="text-col">
          <div class="text-panel" ref="textContainerRef">
            <h2 class="text-h2 q-mt-none q-mb-md" :class="{'text-h4': $q.screen.lt.sm}">
              Browse Game Reports Directly from Your Handheld
            </h2>

            <p>
              Use the <strong><a href="https://github.com/DeckSettings/decky-game-settings" target="_blank">
              Deck Settings </a></strong>
              plugin for Decky Loader to explore game reports right from your handheld device—whether you’re on a
              <strong>Steam Deck</strong>, <strong>ROG Ally</strong>, <strong>Lenovo Legion Go</strong>,
              or any compatible PC running
              <strong><a href="https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227"
                         target="_blank">SteamOS</a></strong>,
              <strong><a href="https://cachyos.org/" target="_blank">CachyOS</a></strong>,
              <strong><a href="https://nobaraproject.org/" target="_blank">Nobara</a></strong>,
              <strong><a href="https://bazzite.gg/" target="_blank">Bazzite</a></strong>,
              or similar Linux-based gaming distributions.
              The plugin integrates seamlessly with Steam's Game Mode, giving you instant access to community provided
              guides and notes right in your handheld UI.
            </p>
            <p>
              Not only can you view detailed reports for your games, but the plugin also includes embedded
              YouTube video reviews, direct links to <a href="https://steamdeckhq.com/game-settings/" target="_blank">SDHQ</a>
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
  display: flex;
  align-items: center;
  gap: 2rem;
  width: 100%;
  max-width: 2000px;
}

.video-col,
.text-col {
  flex: 1 1 50%;
  display: flex;
  justify-content: center;
}

.video-wrapper {
  width: 100%;
}

.video-content {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text-panel {
  max-width: 600px;
  width: 100%;
  text-align: left;
  box-sizing: border-box;
  padding: 0;
}

/* -sm- */
@media (max-width: 600px) {
  .device-section {
    padding: 0 0.1rem;
  }

  .split-container {
    flex-direction: column;
    gap: 1.5rem;
  }

  .text-panel {
    padding: 1.5rem;
    text-align: center;
  }
}
</style>
