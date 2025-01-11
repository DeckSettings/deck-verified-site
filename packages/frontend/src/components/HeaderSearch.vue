<script setup lang="ts">

import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { searchGames } from 'src/services/gh-reports'
import type { GameSearchResult } from '../../../shared/src/game'

const $q = useQuasar()
const router = useRouter()

const searchContainerRef = ref<HTMLElement | null>(null)
const searchResultsRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const showDialog = ref(false)
const searchResults = ref<GameSearchResult[] | null>(null)
const isSearching = ref(false)

let searchTimeout: ReturnType<typeof setTimeout>
const performSearch = async () => {
  clearTimeout(searchTimeout)
  isSearching.value = true
  try {
    const initialResults = await searchGames(searchQuery.value, false)
    searchResults.value = initialResults || []
    searchTimeout = setTimeout(async () => {
      isSearching.value = true
      try {
        const additionalResults = await searchGames(searchQuery.value, true)
        if (additionalResults) {
          if (!searchResults.value) {
            searchResults.value = []
          }
          const existingAppIds = new Set(searchResults.value.map(result => result.appId))
          const newResults = additionalResults.filter(result => !existingAppIds.has(result.appId))
          searchResults.value = [...searchResults.value, ...newResults]
        }
      } catch (error) {
        console.error('Error running extended search for games:', error)
      } finally {
        isSearching.value = false
      }
    }, 2000)
  } catch (error) {
    console.error('Error searching games:', error)
    isSearching.value = false
  }
}


const scrollAreaStyle = computed(() => {
  if (!searchResults.value) {
    return {}
  }
  const itemHeight = 62.73 // Height of each list item
  const maxHeight = window.innerHeight * ($q.screen.lt.sm ? 0.7 : 0.8) // 70% on mobile, 80% otherwise
  if (!isSearching.value && searchResults.value.length > 0) {
    const totalHeight = searchResults.value.length * itemHeight
    return {
      height: `${Math.min(totalHeight, maxHeight)}px`
    }
  }
  return {}
})

const goToGamePage = async (e: Event, path: string) => {
  e.preventDefault()
  searchQuery.value = ''
  showDialog.value = false
  searchResults.value = null
  await router.push(path)
}

watch(searchQuery, (newValue, oldValue) => {
  if (newValue.length === 0) {
    searchResults.value = null
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
      <q-scroll-area class="scroll-area" :style="scrollAreaStyle">
        <q-list>
          <q-item
            v-for="result in searchResults"
            :key="result.appId"
            clickable
            v-ripple
            @click="(e) => goToGamePage(e, result.appId ? `/app/${result.appId}` : `/game/${encodeURIComponent(result.gameName)}`)">
            <q-item-section avatar>
              <q-img
                v-if="result.metadata.banner"
                class="game-image"
                :src="result.metadata.banner"
                alt="Game Banner">
                <template v-slot:error>
                  <img
                    src="~/assets/banner-placeholder.png"
                    alt="Placeholder" />
                </template>
              </q-img>
              <q-img
                v-else
                class="game-image"
                src="~/assets/banner-placeholder.png"
                alt="Game Image">
              </q-img>
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ result.gameName }}</q-item-label>
              <q-item-label caption>App ID: {{ result.appId }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
      <div v-if="searchResults === null && searchQuery.length >= 0" class="text-center text-grey q-ma-md">
        <!-- The search box either has no text, or has text but not enough to trigger a search - no search has been performed yet -->
        Start typing to search for games...
      </div>
      <div v-else-if="!isSearching && searchResults && searchResults.length === 0"
           class="text-center text-grey q-ma-md">
        <!-- The search box either has text and a search was carried out and is complete, but no search results were found -->
        No results found.
      </div>
      <div v-if="isSearching" class="text-center text-grey q-py-md">
        <q-spinner-dots color="primary" size="2em" />
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
  margin-top: 24px;
  z-index: 10;
  width: 100%;
  background-color: color-mix(in srgb, var(--q-dark) 95%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 0px 0px 3px 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.9);
}

.game-image {
  width: 100px;
  height: auto;
  object-fit: contain;
}

/* -sm- */
@media (max-width: 600px) {
  .search-results {
    margin-top: 16px;
  }
}

</style>
