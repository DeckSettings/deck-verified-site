<script setup lang="ts">
import ReportForm from 'components/ReportForm.vue'
/*import { ref } from 'vue'

const reportFormDialogOpen = ref(true)*/
</script>

<template>
  <q-page class="q-pa-none">
    <ReportForm
      :game-name="''"
      :app-id="''"
      :game-banner="''"
      :game-background="''"
      :previous-submission="{game_display_settings: '- **DISPLAY RESOLUTION:** 1280x800'}"
      :display-fullscreen="true" />
  </q-page>
</template>
