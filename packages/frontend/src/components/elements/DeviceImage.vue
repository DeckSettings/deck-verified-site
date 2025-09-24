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
  width: {
    type: String,
    required: false,
    default: '400px',
  },
})

const baseUrl = ref((`${import.meta.env.BASE_URL ?? ''}`).replace(/^\/$/, '').replace(/\/$/, ''))
const placeholderImage = `${baseUrl.value}/devices/device-placeholder.png`

const deviceImagePatterns: Record<string, RegExp> = {
  'asus-rog-ally': /^(ASUS )?ROG Ally( Z1( Extreme)?)?$/i,
  'asus-rog-ally-x': /^(ASUS )?ROG Ally X$/i,
  'gpd-win-4': /^(GPD Win 4)$/i,
  'lenovo-legion-go': /^(Lenovo )?Legion Go$/i,
  'lenovo-legion-go-2': /^(Lenovo Legion Go 2)$/i,
  'lenovo-legion-go-s': /^(Lenovo Legion Go S)$/i,
  'msi-claw': /^(MSI Claw)$/i,
  'msi-claw-a8-plus': /^(MSI Claw A8 Plus)$/i,
  'valve-steam-deck': /^(Valve )?Steam Deck( OLED| LCD.*)?$/i,
  'zotac-zone': /^(Zotac Zone)$/i,
}

const imageSource = computed(() => {
  const device = props.device ?? ''
  for (const [prefix, regex] of Object.entries(deviceImagePatterns)) {
    if (regex.test(device)) {
      return `${baseUrl.value}/devices/${prefix}-${props.size}.png`
    }
  }
  return placeholderImage
})
const altText = computed(() => {
  return `${props.device} Image`
})
const computedStyle = computed(() => {
  const style = [`width: ${props.width};`] as string[]
  if (props.dropShadow) style.push('filter: drop-shadow(7px 7px 3px rgba(0, 0, 0, 0.5));')
  return style
})
</script>

<template>
  <q-img
    :src="imageSource"
    :alt="altText"
    :style="computedStyle"
  />
</template>

<style scoped>

</style>
