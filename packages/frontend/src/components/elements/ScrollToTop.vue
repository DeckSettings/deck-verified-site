<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue'

export default defineComponent({
  name: 'ScrollToTop',
  setup() {
    const showScrollButton = ref(false)

    const handleScroll = () => {
      showScrollButton.value = window.scrollY > 200
    }

    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    onMounted(() => {
      window.addEventListener('scroll', handleScroll)
    })

    onUnmounted(() => {
      window.removeEventListener('scroll', handleScroll)
    })

    return {
      showScrollButton,
      scrollToTop,
    }
  },
})
</script>

<template>
  <q-btn
    v-if="showScrollButton && !$q.platform.isMobileUi"
    round
    unelevated
    icon="arrow_upward"
    color="primary"
    class="scroll-to-top"
    @click="scrollToTop"
  />
</template>

<style scoped>
.scroll-to-top {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
}
</style>
