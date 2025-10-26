<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

const isHelpActive = ref(false)

// touch/click tracking state
let touchStartX = 0
let touchStartY = 0
let touchMoved = false
let lastTouchHandledAt = 0

const TOUCH_MOVE_THRESHOLD = 10 // (in pixels)
let docClickHandler: (() => void) | null = null
let touchStartHandler: ((e: TouchEvent) => void) | null = null
let touchMoveHandler: ((e: TouchEvent) => void) | null = null
let touchEndHandler: (() => void) | null = null

// We need to use a scheduled close timeout so that it still captures clicks.
// Otherwise, a click over a button will still register.
let closeTimeout: number | null = null

function scheduleClose(delay = 100) {
  if (closeTimeout != null) return
  closeTimeout = window.setTimeout(() => {
    closeTimeout = null
    disableHelp()
  }, delay)
}

function cancelScheduledClose() {
  if (closeTimeout != null) {
    clearTimeout(closeTimeout)
    closeTimeout = null
  }
}

function addDocListeners() {
  docClickHandler = () => {
    if (Date.now() - lastTouchHandledAt < 500) return
    scheduleClose(100)
  }
  document.addEventListener('click', docClickHandler, { capture: true })

  touchStartHandler = (ev: TouchEvent) => {
    touchMoved = false
    if (ev.touches && ev.touches[0]) {
      touchStartX = ev.touches[0].clientX
      touchStartY = ev.touches[0].clientY
    }
  }
  touchMoveHandler = (ev: TouchEvent) => {
    if (!ev.touches || !ev.touches[0]) return
    const dx = Math.abs(ev.touches[0].clientX - touchStartX)
    const dy = Math.abs(ev.touches[0].clientY - touchStartY)
    if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
      touchMoved = true
    }
  }
  touchEndHandler = () => {
    if (!touchMoved) {
      lastTouchHandledAt = Date.now()
      scheduleClose(100)
    }
  }

  document.addEventListener('touchstart', touchStartHandler, { passive: true, capture: true })
  document.addEventListener('touchmove', touchMoveHandler, { passive: true, capture: true })
  // touchend is not passive; capture true to observe it early
  document.addEventListener('touchend', touchEndHandler, { capture: true })
}

function removeDocListeners() {
  if (docClickHandler) {
    document.removeEventListener('click', docClickHandler, true)
    docClickHandler = null
  }
  if (touchStartHandler) {
    document.removeEventListener('touchstart', touchStartHandler, true)
    touchStartHandler = null
  }
  if (touchMoveHandler) {
    document.removeEventListener('touchmove', touchMoveHandler, true)
    touchMoveHandler = null
  }
  if (touchEndHandler) {
    document.removeEventListener('touchend', touchEndHandler, true)
    touchEndHandler = null
  }
  cancelScheduledClose()
}

function enableHelp() {
  document.documentElement.classList.add('show-help')
  isHelpActive.value = true
  addDocListeners()
}

function disableHelp() {
  cancelScheduledClose()
  removeDocListeners()
  document.documentElement.classList.remove('show-help')
  isHelpActive.value = false
}

function toggleHelp() {
  if (!isHelpActive.value) {
    enableHelp()
  } else {
    disableHelp()
  }
}

onBeforeUnmount(() => {
  removeDocListeners()
  cancelScheduledClose()
  document.documentElement.classList.remove('show-help')
})
</script>

<template>
  <q-btn
    flat
    dense
    round
    color="white"
    icon="help_outline"
    @click="toggleHelp"
  >
    <q-tooltip anchor="bottom left" self="center right">
      <span v-if="isHelpActive">Hide</span>
      <span v-else>Show</span>
      page help overlay
    </q-tooltip>
  </q-btn>
  <div class="help-blur-overlay"></div>
</template>

<style scoped>

</style>