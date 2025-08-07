<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import draggable from 'vuedraggable'

const commonGameSettingsKeys = [
  'ADAPTIVE PERFORMANCE FPS',
  'AMBIENT OCCLUSION',
  'AMD FIDELITYFX SUPER RESOLUTION 1.0',
  'AMD FIDELITYFX SUPER RESOLUTION 2.0',
  'AMD FIDELITYFX SUPER RESOLUTION 3.1',
  'AMD FSR 2.0',
  'AMD FSR 3.1',
  'ANISOTROPHIC FILTERING',
  'ANISOTROPIC FILTER',
  'ANISOTROPIC FILTERING',
  'ANTI-ALIASING',
  'ANTI-ALIASING METHOD',
  'ANTIALIASING',
  'ASPECT RATIO',
  'BACKGROUND MODEL DETAIL',
  'BRIGHTNESS',
  'CHARACTER MODEL DETAIL',
  'CHARACTER SHADOW DISPLAY DISTANCE',
  'CHARACTERS DISPLAYED',
  'CHROMATIC ABERRATION',
  'CLOUDS',
  'CONTACT SHADOWS',
  'DECAL QUALITY',
  'DEPTH OF FIELD',
  'DISPLAY MODE',
  'DISPLAY RESOLUTION',
  'DISPLAY SYNC TECHNOLOGY',
  'DYNAMIC RANGE',
  'DYNAMIC RESOLUTION',
  'DYNAMIC RESOLUTION SCALING (MAXIMUM)',
  'DYNAMIC RESOLUTION SCALING (MINIMUM)',
  'EFFECT DETAILS',
  'EFFECTS QUALITY',
  'ENABLE DX12 RENDERER',
  'ENABLE REDUCED LATENCY',
  'EXTRA STREAMING DISTANCE',
  'FAR SHADOW QUALITY',
  'FAR VOLUMETRIC RESOLUTION',
  'FIELD OF VIEW',
  'FILM GRAIN',
  'FOG QUALITY',
  'FPS LIMIT',
  'FRAMERATE',
  'FRAMERATE CAP',
  'FULL RESOLUTION SCREEN SPACE AMBIENT OCCLUSION',
  'FULLSCREEN',
  'FULLSCREEN MODE',
  'FUR QUALITY',
  'FXAA',
  'GEOMETRY LEVEL OF DETAIL',
  'GLOBAL ILLUMINATION QUALITY',
  'GRAPHIC QUALITY',
  'GRAPHICS API',
  'GRAPHICS QUALITY',
  'GRASS LEVEL OF DETAIL',
  'GRASS SHADOWS',
  'HDR BRIGHTNESS',
  'HDR DARKNESS',
  'HDR LUMINANCE',
  'HDR RENDERING',
  'HIGH RESOLUTION SKY TEXTURES',
  'IMAGE QUALITY',
  'INTEL XESS',
  'LENS FLARE',
  'LIGHTING QUALITY',
  'LOCAL REFLECTION QUALITY',
  'LOCK TO 30 FPS',
  'LONG SHADOWS',
  'LOW-RESOLUTION FONT',
  'MASTER QUALITY',
  'MAXIMUM FRAME RATE',
  'MEMORY FOR STREAMING',
  'MIRROR QUALITY',
  'MODE',
  'MODEL DETAIL',
  'MODEL QUALITY',
  'MONITOR',
  'MOTION BLUR',
  'MSAA',
  'NEAR VOLUMETRIC RESOLUTION',
  'NEUTRAL LIGHTING',
  'NVIDIA IMAGE SCALING',
  'OBJECT DETAIL',
  'OCEAN DETAIL',
  'PARALLAX MAPPING',
  'PARALLAX OCCLUSION MAPPING QUALITY',
  'PARTICLE DETAIL',
  'PARTICLE LIGHTING QUALITY',
  'PARTICLE QUALITY',
  'PROJECTED TEXTURE RESOLUTION',
  'QUALITY',
  'REFLECTION MSAA',
  'REFLECTION QUALITY',
  'REFLECTIONS',
  'REFRESH RATE',
  'RENDERER',
  'RESOLUTION',
  'RESOLUTION SCALE',
  'SCALING MODE',
  'SCENE BRIGHTNESS',
  'SCREEN MODE',
  'SCREEN RESOLUTION',
  'SCREEN SPACE AMBIENT OCCLUSION',
  'SCREEN SPACE REFLECTIONS',
  'SCREEN TYPE',
  'SHADOW FILTERING',
  'SHADOW QUALITY',
  'SHADOW RESOLUTION',
  'SHADOWS',
  'SHARPENING',
  'SHARPNESS',
  'SOFT SHADOWS',
  'SPOT SHADOW RESOLUTION',
  'SPOT SHADOWS',
  'SUB-SURFACE SCATTERING',
  'SUPERSAMPLING',
  'TAA',
  'TAA SHARPENING',
  'TERRAIN QUALITY',
  'TESSELATION QUALITY',
  'TEXTURE QUALITY',
  'TEXTURE RESOLUTION',
  'TEXTURES',
  'TREE QUALITY',
  'TREE TESSELLATION',
  'TRIPLE BUFFERING',
  'UI BRIGHTNESS',
  'UPSCALE METHOD',
  'UPSCALE MODE',
  'UPSCALING',
  'V-SYNC',
  'VEGETATION QUALITY',
  'VIGNETTE EFFECT',
  'VOLUMETRIC FOG',
  'VOLUMETRIC LIGHTING',
  'VOLUMETRIC LIGHTING QUALITY',
  'VSYNC',
  'WATER PHYSICS QUALITY',
  'WATER QUALITY',
  'WATER REFLECTION QUALITY',
  'WATER REFRACTION QUALITY',
  'WINDOW RESOLUTION',
  'WINDOW SIZE',
  'WINDOWED MODE',
]
const commonGameSettingsValues = [
  '1024x640',
  '1024x768',
  '1152x720',
  '1280x720',
  '1280x800',
  '1600x1000',
  '1600x900',
  '16:10',
  '16:9',
  '1920x1080',
  '1920x1200',
  '2048x1080',
  '2560x1440',
  '2560x1600',
  '3840x2160',
  '640x400',
  '640x480',
  '800x500',
  '800x600',
  'AMD FSR 3 Super Resolution',
  'Performance',
  'Balanced',
  'Ultra Quality',
  'Ultra Performance',
  'Borderless Full Screen',
  'Borderless Windowed',
  'Custom',
  'Default',
  'DirectX12',
  'Disabled',
  'Exclusive Fullscreen',
  'Full Screen',
  'Fullscreen',
  'Furthest to the left',
  'HDR',
  'High',
  'Intel XeSS',
  'NVIDIA DLSS',
  'Low',
  'Medium',
  'No',
  'Normal',
  'Off',
  'On',
  'Quality',
  'Ultra',
  'Unchecked',
  'Very Low',
  'Vulcan',
  'Yes',
]

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

    // Initialize key/value pairs from previousData.
    // previousData is expected to be a markdown list of the form:
    // - **KEY:** Value
    const initKeyValuePairs = async () => {
      if (!props.previousData) return
      const lines: string[] = props.previousData.split('\n')
      // Regex matches lines like: - **Key:** Value
      const regex = /^-\s\*\*(.+?):\*\*\s*(.+)$/
      const pairs: Row[] = []
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const match = trimmed.match(regex)
        if (match && match.length > 2) {
          pairs.push({
            id: nextRowId++,
            key: match[1]?.trim().toUpperCase() as string,
            value: match[2]?.trim() as string,
          })
        }
      }
      if (pairs.length > 0) {
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
      sections.value.push({ title: 'New Section', items: [] })
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
  <div class="q-mb-xl">
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
  padding: 10px
}

.game-settings-section .game-settings-item {
  border-bottom: 1px solid #ddd;
}

.game-settings-section .game-settings-item:first-child {
  border-top: 1px solid #ddd;
}

</style>
