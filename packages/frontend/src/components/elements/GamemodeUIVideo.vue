<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

// Console background image (angled at 45°)
import consoleImage from '../../assets/legion-go-s-steam-45-degree-front-facing-left.png'
// The image shown initially (until the threshold is reached)
import zoomImage from '../../assets/steam-gamemode-ui-2.jpg'
//import zoomImage from '../../assets/output.jpg';

// The video will be dynamically imported (so not in the initial SSR bundle).
const videoSrc = ref<string>('')

// We track scale (from 0.8 to 1.0) and whether to show the video
const scale = ref(0.8)
const showVideo = ref(false)

// Adjust these for your desired scroll-based zoom
const minScale = 0.8
const maxScale = 1.0
const threshold = 0.99

// We'll reference the outer wrapper for scroll calculations
const containerRef = ref<HTMLElement | null>(null)

// Simple throttle to avoid handling scroll events too frequently
function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let lastCall = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      fn(...args)
    }
  }) as T
}

// As the user scrolls, figure out how much of the container is visible
// and interpolate the scale from minScale to maxScale.
const handleScroll = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight

  // transitionDistance is the distance from when the element is off-screen (top at viewport bottom)
  // to when the element is centered (its center equals viewport center)
  const transitionDistance = (viewportHeight + rect.height) / 2

  // progress = 0 when rect.top equals viewportHeight
  // progress = 1 when rect.top equals (viewportHeight/2 - rect.height/2)
  let progress = (viewportHeight - rect.top) / transitionDistance
  progress = Math.min(Math.max(progress, 0), 1)

  // Interpolate scale based on scroll progress.
  scale.value = minScale + (maxScale - minScale) * progress

  // Swap to video once scale passes the threshold.
  showVideo.value = scale.value >= threshold
}

const throttledHandleScroll = throttle(handleScroll, 20)

onMounted(async () => {
  window.addEventListener('scroll', throttledHandleScroll)
  // Compute initial scale in case the component is already in view
  handleScroll()

  // Dynamically load the video file
  const videoModule = await import('../../assets/steam-gamemode-ui-2.mp4')
  videoSrc.value = videoModule.default
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', throttledHandleScroll)
})
</script>

<template>
  <!--
    This outer wrapper is what we measure in handleScroll (via containerRef).
    Inside it is the console container, which we scale based on scroll.
  -->
  <div ref="containerRef" class="outer-wrapper">
    <div class="console-container" :style="{ transform: `scale(${scale})` }">
      <!-- Console angled background -->
      <img class="console-bg" :src="consoleImage" alt="Console Background" />

      <!-- Screen content container: absolutely positioned over the console's black screen area -->
      <div class="screen-content">
        <!-- Show the image until threshold is reached -->
        <img
          v-if="!showVideo"
          :src="zoomImage"
          alt="Zooming Visual"
          class="fill"
        />
        <!-- Swap to the video once threshold is reached -->
        <video
          v-else
          class="fill"
          :src="videoSrc"
          autoplay
          muted
          loop
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  The outer wrapper just needs to contain the console container
  so we can measure how far it has scrolled into view.
*/
.outer-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}

/*
  The console container holds the angled console image.
  We apply a scale transform to this entire container as the user scrolls.
*/
.console-container {
  position: relative;
  max-width: 800px; /* Adjust as desired */
  transform-origin: center center;
  transition: transform 0.2s ease-out;
}

/* The angled console background image */
.console-bg {
  width: 100%;
  display: block;
  transform: rotateX(-10deg) rotateY(-20deg) rotateZ(0deg) translate(-123px, -62px);
}

/*
  Absolutely position the screen-content so it sits on top of the
  black 'screen' portion of your console image.
  Adjust these values so the content lines up exactly with the screen area.
*/
.screen-content {
  position: absolute;
  top: -25px;
  left: 0px;
  width: 800px;
  height: 600px;
  /*height: 80%; *//* Adjust for your image */
  overflow: hidden;
  transform: perspective(1200px) rotateX(15deg) rotateY(-15deg) rotateZ(14deg) translate(-242px, -135px) scale(0.61);
  /*clip-path: polygon(21.8236% 9.11079%, 75.5417% 10.6331%, 63.5393% 81.5945%, 9.38204% 71.1728%);*/

  /*transform: perspective(1600px) rotateX(24deg) rotateY(-24deg) rotateZ(19deg) scale(0.9);*/
  /*transform-origin: center center;
  transition: transform 0.3s ease;*/
}

/*
  The fill class ensures the image/video fully fills the .screen-content area.
  object-fit: cover ensures it will crop if the aspect ratio doesn't match exactly.
*/
.fill {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
</style>
