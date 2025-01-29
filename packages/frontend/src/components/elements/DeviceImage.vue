<script lang="ts">
import { defineComponent, computed } from 'vue'


export default defineComponent({
  props: {
    device: {
      type: String,
      required: true
    },
    shadow: {
      type: Boolean,
      required: false,
      default: false
    }
  },
  setup(props) {
    const placeholderImage = props.shadow ? 'devices/device-placeholder-shadow.png' : 'devices/device-placeholder.png'

    const imageSource = computed(() => {
      switch (props.device) {
        case 'Steam Deck LCD (64GB)':
          return props.shadow ? 'devices/valve-steam-deck-shadow.png' : 'devices/valve-steam-deck.png'
        case 'Steam Deck LCD (256GB/512GB)':
          return props.shadow ? 'devices/valve-steam-deck-shadow.png' : 'devices/valve-steam-deck.png'
        case 'Steam Deck OLED':
          return props.shadow ? 'devices/valve-steam-deck-shadow.png' : 'devices/valve-steam-deck.png'
        case 'ROG Ally Z1':
          return props.shadow ? 'devices/asus-rog-ally-shadow.png' : 'devices/asus-rog-ally.png'
        case 'ROG Ally Z1 Extreme':
          return props.shadow ? 'devices/asus-rog-ally-shadow.png' : 'devices/asus-rog-ally.png'
        case 'ROG Ally X':
          return props.shadow ? 'devices/asus-rog-ally-x-shadow.png' : 'devices/asus-rog-ally-x.png'
        case 'Legion Go':
          return props.shadow ? 'devices/lenovo-legion-go-shadow.png' : 'devices/lenovo-legion-go.png'
        default:
          return placeholderImage
      }
    })

    const altText = computed(() => {
      return `${props.device} Image`
    })

    const computedStyle = computed(() => {
      let style = 'width: 80px;'
      if (props.shadow) {
        style = 'width: 100px; margin-left: -5px; margin-bottom: -15px;'
      }
      return style
    })

    return {
      imageSource,
      altText,
      computedStyle,
      placeholderImage
    }
  }
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
