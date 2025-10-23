<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import draggable from 'vuedraggable'
import { parseMarkdownKeyValueList } from 'src/utils/markdownSettings'
import { commonGameSettingsKeys, commonGameSettingsValues } from 'src/constants/game-settings-key-map'

export default defineComponent({
  methods: { marked },
  components: {
    draggable,
  },
  props: {
    fieldData: {
      type: Object,
      required: true,
    },
    previousData: {
      type: String,
      required: false,
    },
    invalidData: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  emits: ['update'],
  setup(props, { emit }) {
    const dragGroup = ref<string>(props.fieldData.id)

    // Each section has a title and an items array (of key/value pairs).
    // Sections are optional; if no previousData creates one, a default section is created.
    type Row = { id: number; key: string; value: string }
    const sections = ref<{ title: string; items: Row[] }[]>([])
    let nextRowId = 0

    const defaultSectionTitle = ''

    // Autocomplete source options (the originals) and the mutable options for q-select filtering.
    const initialKeyOptions = ref<string[]>([])
    const keyOptions = ref<string[]>([])
    const initialValueOptions = ref<string[]>([])
    const valueOptions = ref<string[]>([])

    // Initialise key/value pairs from previousData.
    // previousData is expected to be a markdown list of the form:
    // - **KEY:** Value
    const initKeyValuePairs = async () => {
      if (!props.previousData) return
      const entries = parseMarkdownKeyValueList(props.previousData)
      if (entries.length > 0) {
        const pairs: Row[] = entries.map(entry => ({
          id: nextRowId++,
          key: entry.key,
          value: entry.value,
        }))
        sections.value.push({ title: defaultSectionTitle, items: pairs })
      }
    }

    // Initialize autocomplete options from common settings, and add any keys/values from sections.
    const initKeyValueAutocompleteOptions = async () => {
      initialKeyOptions.value = [...commonGameSettingsKeys]
      initialValueOptions.value = [...commonGameSettingsValues]
      sections.value.forEach(section => {
        section.items.forEach(pair => {
          if (!initialKeyOptions.value.includes(pair.key)) {
            initialKeyOptions.value.push(pair.key.toUpperCase())
          }
          if (!initialValueOptions.value.includes(pair.value)) {
            initialValueOptions.value.push(pair.value)
          }
        })
      })
      keyOptions.value = [...initialKeyOptions.value]
      valueOptions.value = [...initialValueOptions.value]

      // console.log([...new Set(initialKeyOptions.value.map(item => item.toUpperCase()))].sort())
      // console.log([...new Set(initialKeyOptions.value)].sort())
      // console.log([...new Set(initialValueOptions.value)].sort())
    }

    // Group options for draggable lists.
    // Using a shared group name so that items can be moved between sections.
    const draggableGroupOptions = {
      name: 'shared',
      pull: true,
      put: true,
    }

    // Section management.
    const addSection = () => {
      sections.value.push({ title: '', items: [] })
    }

    const deleteSection = (sectionIndex: number) => {
      sections.value.splice(sectionIndex, 1)
    }

    function makeBlankRow(): Row {
      return { id: nextRowId++, key: '', value: '' }
    }

    const addPair = (sectionIndex: number) => {
      sections.value[sectionIndex]?.items.push(makeBlankRow())
    }

    const deletePair = (sectionIndex: number, pairIndex: number) => {
      sections.value[sectionIndex]?.items.splice(pairIndex, 1)
    }

    // Autocomplete filters.
    const keyFilter = (
      val: string,
      update: (callback: () => void) => void,
      abort: () => void,
    ) => {
      // Set a minimum length before filtering (currently disabled - 0)
      if (val.length < 0) {
        abort()
        return
      }
      update(() => {
        const needle = val.toLowerCase()
        keyOptions.value = initialKeyOptions.value.filter(v =>
          v.toLowerCase().includes(needle),
        )
      })
    }

    const valueFilter = (
      val: string,
      update: (callback: () => void) => void,
      abort: () => void,
    ) => {
      // Set a minimum length before filtering (currently disabled - 0)
      if (val.length < 0) {
        abort()
        return
      }
      update(() => {
        const needle = val.toLowerCase()
        valueOptions.value = initialValueOptions.value.filter(v =>
          v.toLowerCase().includes(needle),
        )
      })
    }

    const savePluginFlow = () => {
      console.log(sections.value)
    }

    // Emit changes whenever the sections structure changes.
    watch(
      sections,
      (newVal) => {
        emit('update', newVal)
      },
      { deep: true },
    )

    watch(
      sections,
      (allSections) => {
        allSections.forEach(section => {
          const items = section.items
          const last = items[items.length - 1]

          // 1) if there is no "last" (i.e. items was empty), add a blank
          if (!last) {
            items.push(makeBlankRow())
          }
          // 2) otherwise last is definitely defined, so TS is happy here
          else if (last.key.trim() !== '' && last.value.trim() !== '') {
            items.push(makeBlankRow())
          }
        })
      },
      { deep: true },
    )

    onMounted(async () => {
      await initKeyValuePairs()
      await initKeyValueAutocompleteOptions()
      if (sections.value.length === 0) {
        sections.value.push({ title: defaultSectionTitle, items: [] })
      }
    })

    return {
      dragGroup,
      sections,
      draggableGroupOptions,
      addSection,
      deleteSection,
      addPair,
      deletePair,
      keyFilter,
      keyOptions,
      valueFilter,
      valueOptions,
      savePluginFlow,
    }
  },
})
</script>

<template>
  <div class="q-mb-xs">
    <div class="text-h6 q-my-sm">
      {{ fieldData.attributes.label }}
    </div>
    <div v-if="fieldData.validations?.required && !invalidData" class="text-caption q-my-sm text-grey-6">
      (THESE FIELDS ARE REQUIRED)
    </div>
    <div v-if="fieldData.validations?.required && invalidData" class="text-caption q-my-sm text-negative">
      At least one option needs to be added. If the game has no settings, <br /> simply add a single option
      <strong>"Display Resolution"</strong> with the resolution of your device as the value.
    </div>

    <!-- Render each section (not draggable) -->
    <div v-for="(section, sectionIndex) in sections" :key="sectionIndex"
         class="q-mb-lg rounded-borders game-settings-section">
      <q-input
        standout
        dense
        v-model="section.title"
        type="text"
        label="Section name (optional)"
        placeholder="e.g. Texture Settings, Lighting Settings, etc"
        hint="Give this section a title to group related options"
        clearable
      />
      <q-list separator class="q-pa-none q-mt-sm">
        <!-- Draggable list for items in this section -->
        <draggable
          v-model="section.items"
          :group="draggableGroupOptions"
          item-key="id"
          handle=".handle"
          ghost-class="ghost"
          animation="100"
          delay="200"
          delay-on-touch-only="true"
          @end="savePluginFlow"
        >
          <template #item="{ element: pair, index: pairIndex }">
            <q-item clickable v-ripple class="game-settings-item" :class="{'q-px-none' : $q.screen.lt.md }">
              <q-item-section avatar :class="{'q-pa-none' : $q.screen.lt.md }">
                <q-avatar rounded>
                  <q-icon name="drag_handle" class="handle" color="secondary" style="max-width: 30px;">
                    <q-tooltip class="bg-white text-primary">Drag option</q-tooltip>
                  </q-icon>
                </q-avatar>
              </q-item-section>
              <q-item-section v-if="$q.screen.lt.sm" class="col">
                <q-select
                  filled
                  dense
                  class="q-pa-xs"
                  v-model="pair.key"
                  use-input
                  hide-selected
                  hide-dropdown-icon
                  fill-input
                  input-debounce="0"
                  :options="keyOptions"
                  new-value-mode="add-unique"
                  @input-value="val => pair.key = val"
                  @filter="keyFilter" />
                <q-select
                  filled
                  dense
                  class="q-pa-xs"
                  v-model="pair.value"
                  use-input
                  hide-selected
                  hide-dropdown-icon
                  fill-input
                  input-debounce="0"
                  :options="valueOptions"
                  new-value-mode="add-unique"
                  @input-value="val => pair.value = val"
                  @filter="valueFilter" />
              </q-item-section>
              <q-item-section v-if="!$q.screen.lt.sm" class="col">
                <q-select
                  filled
                  dense
                  v-model="pair.key"
                  use-input
                  hide-selected
                  hide-dropdown-icon
                  fill-input
                  input-debounce="0"
                  :options="keyOptions"
                  new-value-mode="add-unique"
                  @input-value="val => pair.key = val"
                  @filter="keyFilter" />
              </q-item-section>
              <q-item-section v-if="!$q.screen.lt.sm" class="col">
                <q-select
                  filled
                  dense
                  v-model="pair.value"
                  use-input
                  hide-selected
                  hide-dropdown-icon
                  fill-input
                  input-debounce="0"
                  :options="valueOptions"
                  new-value-mode="add-unique"
                  @input-value="val => pair.value = val"
                  @filter="valueFilter" />
              </q-item-section>
              <q-item-section side>
                <q-btn
                  size="12px"
                  flat
                  dense
                  round
                  icon="delete"
                  color="red"
                  @click="deletePair(sectionIndex, pairIndex)"
                >
                  <q-tooltip class="bg-white text-primary">Delete Option</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </template>
          <template #footer>
            <div class="column">
              <div class="col self-end">
                <!-- Button to add a key/value pair to this section -->
                <q-btn
                  glossy
                  color="primary"
                  class="q-mt-sm q-ml-lg"
                  @click="addPair(sectionIndex)">
                  <q-icon left size="3em" name="add_circle" />
                  <div>ADD OPTION</div>
                  <q-tooltip class="bg-white text-primary">Add a new option to the above list</q-tooltip>
                </q-btn>
              </div>
            </div>
          </template>
        </draggable>


      </q-list>
    </div>

    <!-- Button to add a new section (not draggable) -->
    <q-btn
      dense
      glossy
      class="full-width q-mt-sm q-ml-lg"
      color="primary"
      @click="addSection">
      <q-icon left size="3em" name="add_circle" />
      <div>ADD SECTION</div>
      <q-tooltip class="bg-white text-primary">Add a new section</q-tooltip>
    </q-btn>
  </div>
</template>

<style scoped>
.ghost {
  opacity: 0.4;
}

.game-settings-section {
  background-color: color-mix(in srgb, var(--q-dark) 80%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 3px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 10px;
  overflow-x: hidden;
}

.game-settings-section .game-settings-item {
  border-bottom: 1px solid #ddd;
}

.game-settings-section .game-settings-item:first-child {
  border-top: 1px solid #ddd;
}

/* Small-screen optimizations */
@media (max-width: 599.98px) {
  .game-settings-section {
    padding: 4px;
  }

  /* Prevent horizontal overflow of Quasar item layout */
  .game-settings-section :deep(.q-item) {
    overflow: hidden;
  }

  .game-settings-section :deep(.q-item__section) {
    min-width: 0;
  }

  .game-settings-section :deep(.q-item__section--avatar) {
    flex: 0 0 28px;
  }

  .game-settings-section :deep(.q-avatar) {
    width: 24px;
    height: 24px;
  }

  /* Smaller drag handle icon on tiny screens */
  .game-settings-section .handle {
    max-width: 18px !important;
  }

  /* Keep the side action area compact */
  .game-settings-section :deep(.q-item__section--side) {
    flex: 0 0 auto;
  }

  /* Ensure selects/fields take full width and wrap properly */
  .game-settings-section :deep(.q-field),
  .game-settings-section :deep(.q-select) {
    width: 100%;
  }

  /* Reduce internal horizontal paddings */
  .game-settings-section .game-settings-item {
    padding-left: 0;
    padding-right: 0;
  }

  /* Remove large left margins on buttons and make them full width */
  .q-btn.q-ml-lg {
    margin-left: 0 !important;
    width: 100%;
    justify-content: center;
  }
}

</style>
