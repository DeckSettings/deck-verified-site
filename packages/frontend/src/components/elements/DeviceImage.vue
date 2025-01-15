<script lang="ts">
import { defineComponent, computed } from 'vue'


export default defineComponent({
  props: {
    device: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const placeholderImage = '~/assets/devices/device-placeholder.png'

    const imageSource = computed(() => {
      switch (props.device) {
        case 'Steam Deck LCD (64GB)':
          return '~/assets/devices/valve-steam-deck.png'
        case 'Steam Deck LCD (256GB/512GB)':
          return '~/assets/devices/asus-rog-ally.png'
        case 'Steam Deck OLED':
          return '~/assets/devices/asus-rog-ally.png'
        case 'ROG Ally Z1':
          return '~/assets/devices/asus-rog-ally.png'
        case 'ROG Ally Z1 Extreme':
          return '~/assets/devices/asus-rog-ally.png'
        case 'ROG Ally X':
          return '~/assets/devices/asus-rog-ally-x.png'
        case 'Legion Go':
          return '~/assets/devices/lenovo-legion-go.png'
        default:
          return placeholderImage
      }
    })

    const altText = computed(() => {
      return `${props.device} Image`
    })

    const computedStyle = computed(() => {
      return 'width: 60px;'
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
    v-if="device === 'Steam Deck LCD (64GB)' || device === 'Steam Deck LCD (256GB/512GB)' || device === 'Steam Deck OLED'"
    src="~/assets/devices/valve-steam-deck.png"
    :alt="altText"
    :style="computedStyle"
  />
  <q-img
    v-else-if="device === 'ROG Ally Z1' || device === 'ROG Ally Z1 Extreme'"
    src="~/assets/devices/asus-rog-ally.png"
    :alt="altText"
    :style="computedStyle"
  />
  <q-img
    v-else-if="device === 'ROG Ally X'"
    src="~/assets/devices/asus-rog-ally-x.png"
    :alt="altText"
    :style="computedStyle"
  />
  <q-img
    v-else-if="device === 'Legion Go'"
    src="~/assets/devices/lenovo-legion-go.png"
    :alt="altText"
    :style="computedStyle"
  />
  <q-img
    v-else
    src="~/assets/devices/device-placeholder.png"
    alt="Placeholder Image"
    :style="computedStyle"
  />

  <!--                    <q-img
                        v-if="report.data.app_id"
                        :src="consoleImage(report.data.device)"
                        alt="Game Image"
                        :ratio="2/3"
                        :style="$q.platform.is.mobile ? 'height: 20px;' : 'height: 30px;'"
                      >
                        <template v-slot:error>
                          <img
                            src="~/assets/banner-placeholder.png"
                            alt="Placeholder"
                            :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                          />
                        </template>
                      </q-img>
                      <img
                        v-else
                        src="~/assets/banner-placeholder.png"
                        alt="Placeholder"
                        :style="$q.platform.is.mobile ? 'width: 80px; height: 120px;' : 'width: 100px; height: 150px;'"
                      />-->
</template>

<style scoped>

</style>
