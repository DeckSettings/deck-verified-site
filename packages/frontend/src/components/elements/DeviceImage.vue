<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps({
  device: {
    type: String,
    required: true,
  },
  dropShadow: {
    type: Boolean,
    required: false,
    default: false,
  },
  size: {
    type: String,
    required: false,
    default: 'small',
  },
})

const baseUrl = ref((`${import.meta.env.BASE_URL ?? ''}`).replace(/^\/$/, '').replace(/\/$/, ''))
const placeholderImage = `${baseUrl.value}/devices/device-placeholder.png`
const imageSource = computed(() => {
  switch (props.device) {
    case 'Steam Deck LCD (64GB)':
      return `${baseUrl.value}/devices/valve-steam-deck-${props.size}.png`
    case 'Steam Deck LCD (256GB/512GB)':
      return `${baseUrl.value}/devices/valve-steam-deck-${props.size}.png`
    case 'Steam Deck OLED':
      return `${baseUrl.value}/devices/valve-steam-deck-${props.size}.png`
    case 'ROG Ally Z1':
      return `${baseUrl.value}/devices/asus-rog-ally-${props.size}.png`
    case 'ROG Ally Z1 Extreme':
      return `${baseUrl.value}/devices/asus-rog-ally-${props.size}.png`
    case 'ROG Ally X':
      return `${baseUrl.value}/devices/asus-rog-ally-x-${props.size}.png`
    case 'Legion Go':
      return `${baseUrl.value}/devices/lenovo-legion-go-${props.size}.png`
    case 'Legion Go S':
      return `${baseUrl.value}/devices/lenovo-legion-go-s-${props.size}.png`
    case 'Zone':
      return `${baseUrl.value}/devices/zotac-zone-${props.size}.png`
    default:
      return placeholderImage
  }
})
const altText = computed(() => {
  return `${props.device} Image`
})
const computedClass = computed(() => {
  const classes = ['device-image'] as string[]
  if (props.dropShadow) classes.push('device-image-with-shadow')
  return classes
})
</script>

<template>
  <q-img
    :src="imageSource"
    :alt="altText"
    :class="computedClass"
  />
</template>

<style scoped>
.device-image {
  width: 80px;
}

.device-image-with-shadow {
  filter: drop-shadow(7px 7px 3px rgba(0, 0, 0, 0.5));
}
</style>
