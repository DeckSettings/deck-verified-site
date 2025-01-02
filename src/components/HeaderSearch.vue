<script setup lang="ts">

import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { searchGames } from 'src/services/gh-reports'
import type { GameSearchResult } from 'src/services/gh-reports'

const router = useRouter()

const searchContainerRef = ref<HTMLElement | null>(null)
const searchResultsRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const showDialog = ref(false)
const searchResults = ref<GameSearchResult[]>([])

const performSearch = async () => {
  try {
    const results = await searchGames(searchQuery.value)
    searchResults.value = results || []
    showDialog.value = true
  } catch (error) {
    console.error('Error searching games:', error)
  }
}

const goToGamePage = async (e: Event, path: string) => {
  e.preventDefault()
  searchQuery.value = ''
  showDialog.value = false
  searchResults.value = []
  await router.push(path)
}

watch(searchQuery, (newValue, oldValue) => {
  if (newValue.length === 0) {
    showDialog.value = false
  } else if (newValue !== oldValue) {
    showDialog.value = true
    if (newValue.length > 2) {
      performSearch()
    }
  }
})

function handleOutsideClick(event: MouseEvent | TouchEvent) {
  const target = event.target as HTMLElement
  if (
    searchContainerRef.value &&
    !searchContainerRef.value.contains(target) &&
    searchResultsRef.value &&
    !searchResultsRef.value.contains(target)
  ) {
    showDialog.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('touchstart', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('touchstart', handleOutsideClick)
})
</script>

<template>
  <div ref="searchContainerRef" class="game-search-container" :class="{'full-width': $q.screen.lt.sm}">
    <q-input
      v-model="searchQuery"
      placeholder="Search by name or appid"
      dense filled outlined
      class="search-input"
      :class="{'full-width': $q.screen.lt.sm}"
      debounce="500"
      @focus="showDialog = true"
    >
      <template v-slot:append>
        <q-icon name="search" @click="performSearch" />
      </template>
    </q-input>

    <div v-if="showDialog" ref="searchResultsRef" class="search-results">
      <q-list>
        <q-item
          v-for="result in searchResults"
          :key="result.appId"
          clickable
          v-ripple
          @click="(e) => goToGamePage(e, result.appId ? `/app/${result.appId}` : `/game/${encodeURIComponent(result.name)}`)">
          <q-item-section avatar>
            <img
              v-if="!result.poster"
              src="~/assets/poster-placeholder.png"
              alt="Placeholder"
              class="game-image"
            >
            <img
              v-else
              :src="result.poster"
              alt="Game Image"
              class="game-image"
            >
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ result.name }}</q-item-label>
            <q-item-label caption>App ID: {{ result.appId }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
      <div v-if="searchQuery.length === 0" class="text-center text-grey">
        No results found.
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-search-container {
  position: relative;
  width: 400px;
  display: flex;
  justify-content: flex-end;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 25px;
  z-index: 10;
  width: 100%;
  background-color: color-mix(in srgb, var(--q-dark) 85%, transparent);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.game-image {
  width: 40px;
  height: auto;
  object-fit: contain;
}
</style>
