<script setup lang="ts">
import { ref, defineProps, onMounted } from 'vue'

const props = defineProps<{
  /** image URL */
  src: string
  /** thumbnail max-width (e.g. '400px', '50%') */
  maxWidth?: string
}>()

const open = ref(false)
const resolvedSrc = ref<string | undefined>(undefined)
const isMounted = ref(false)
onMounted(async () => {
  isMounted.value = true
  resolvedSrc.value = new URL(props.src, import.meta.url).href
})
</script>

<template>
  <div v-if="isMounted" class="relative-display" :style="{ maxWidth: props.maxWidth || '400px' }">
    <q-img
      lazy
      placeholder-src="~/assets/banner-placeholder.png"
      :src="resolvedSrc"
      class="cursor-zoom-in"
      @click="open = true"
    />
    <q-btn
      dense
      flat
      round
      icon="zoom_in"
      class="absolute-top-right cursor-pointer"
      @click.stop="open = true"
    />
  </div>
  <q-dialog
    full-width
    v-model="open"
    transition-show="scale"
    transition-hide="scale"
    @hide="open = false">
    <q-card flat class="bg-black">
      <q-card-section class="row items-center q-pb-none">
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>
      <q-card-section>
        <q-img
          lazy
          :src="resolvedSrc"
          style="max-width: 90vw; max-height: 90vh; margin:0 auto; display: block;"
          class="cursor-zoom-out"
          @click="open = false"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.relative-display {
  position: relative;
}

.absolute-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}

.cursor-zoom-in {
  cursor: zoom-in;
}

.cursor-zoom-out {
  cursor: zoom-out;
}
</style>
