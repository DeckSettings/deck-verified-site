<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <q-btn
    flat
    dense
    icon="arrow_back"
    label="Back"
    class="back-btn"
    @click="router.go(-1)"
  />
</template>

<style scoped>
.back-btn {
  position: absolute;
  top: 26px;
  left: 26px;
  z-index: 10;

  /* Hide on mobile */
  display: none;
}

@media (min-width: 768px) {
  /* Show only on tablets and larger */
  .back-btn {
    display: block;
  }
}
</style>
