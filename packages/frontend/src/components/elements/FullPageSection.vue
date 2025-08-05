<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  imageUrl: string
  transition?: string
  scrollLockDuration?: number
}>()

defineSlots<{
  default: (props: {
    scrollContainer: HTMLElement | null
  }) => unknown
}>()

const isBackgroundVisible = ref(false)
const sectionRef = ref<HTMLElement | null>(null)
const contentWrapperRef = ref<HTMLElement | null>(null)

// Function checks if the user has scrolled past the section
const checkScroll = () => {
  if (!sectionRef.value) return

  const rect = sectionRef.value.getBoundingClientRect()
  const windowHeight = window.innerHeight

  // Show the background if any part of the section is in the viewport
  isBackgroundVisible.value = rect.bottom > 0 && rect.top < windowHeight
}

onMounted(() => {
  // Use a simple scroll event listener instead of an IntersectionObserver for this
  window.addEventListener('scroll', checkScroll)
  checkScroll() // Initial check
})

onUnmounted(() => {
  window.removeEventListener('scroll', checkScroll)
})
</script>

<template>
  <section
    ref="sectionRef" class="full-page-section"
    :style="{
      '--scroll-lock-height': props.scrollLockDuration ? `${props.scrollLockDuration * 100}vh` : '0',
    }"
  >
    <div
      class="background-image"
      :class="{ 'is-visible': isBackgroundVisible }"
      :style="{
        backgroundImage: `url(${props.imageUrl})`,
        'transition-duration': props.transition || '1s',
      }"
    />

    <div ref="contentWrapperRef" class="content-wrapper">
      <q-container class="q-pa-md">
        <slot
          :scrollContainer="contentWrapperRef"
        />
      </q-container>
    </div>
  </section>
</template>

<style scoped>
.full-page-section {
  position: relative;
  min-height: 100vh;
  /* Important - This adds the extra height for the scroll lock effect using content-wrapper */
  height: calc(100vh + var(--scroll-lock-height));
}

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
}

.background-image.is-visible {
  opacity: 0.3;
}

.content-wrapper {
  /* This is the container that will stick */
  position: sticky;
  top: 0;
  min-height: 100vh;
  z-index: 1;
  display: block;
}
</style>
