<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'
import HomeReportsList from 'components/HomeReportsList.vue'

const route = useRoute()

const reportType = computed(() => route.params.type)

const refreshVersion = ref(0)

const handleRefresh = async (done: () => void) => {
  refreshVersion.value++
  await nextTick()
  done()
}
</script>

<template>
  <q-pull-to-refresh class="fit" @refresh="handleRefresh">
    <q-page class="q-pa-md">
      <div v-if="reportType === 'recent'">
        <HomeReportsList
          :key="`recent-${refreshVersion}`"
          reportSelection="recentlyUpdated"
          :count="20" />
      </div>
      <div v-else-if="reportType === 'views'">
        <HomeReportsList
          :key="`views-${refreshVersion}`"
          reportSelection="views"
          :count="20" />
      </div>
      <div v-else-if="reportType === 'popular'">
        <HomeReportsList
          :key="`popular-${refreshVersion}`"
          reportSelection="popular"
          :count="20" />
      </div>
      <div v-else>
        <!-- Handle other report types or show a default message -->
        <div class="text-h6">Report type "{{ reportType }}" not found.</div>
      </div>
    </q-page>
  </q-pull-to-refresh>
</template>
