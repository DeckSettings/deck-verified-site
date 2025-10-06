<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import { useFeatureFlags } from 'src/composables/useFeatureFlags'
import { useProgressNotifications } from 'src/composables/useProgressNotifications'
import { useAuthStore } from 'src/stores/auth-store'
import { gameReportTemplate } from 'src/services/gh-reports'
import type {
  GameReportForm,
  GitHubIssueTemplateBody,
  GitHubReportIssueBodySchema,
  GitHubReportIssueBodySchemaProperty,
} from '../../../shared/src/game'
import GameSettingsFields from 'components/elements/GameSettingsFields.vue'
import ReportFormMarkdown from 'components/elements/ReportFormMarkdown.vue'
import ZoomableImage from 'components/elements/ZoomableImage.vue'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import AdmonitionBanner from 'components/elements/AdmonitionBanner.vue'
import LasOfUsGraphicSettingsImage from '../assets/Last-of-Us-Part-1-Graphics-Settings.jpg'

const props = defineProps({
  gameName: {
    type: String,
    required: true,
  },
  appId: {
    type: String,
    required: false,
  },
  gameBanner: {
    type: String,
    required: false,
  },
  gameBackground: {
    type: String,
    required: false,
  },
  previousSubmission: {
    type: Object,
    required: false,
  },
  displayFullscreen: {
    type: Boolean,
    required: false,
    default: false,
  },
  showCancelButton: {
    type: Boolean,
    required: false,
    default: true,
  },
  showClearButton: {
    type: Boolean,
    required: false,
    default: false,
  },
})

const $q = useQuasar()

const reportForm = ref()
const formData = ref<GameReportForm | null>(null)
const formValues = ref<Record<string, string | number | null>>({})
const previousFormValues = ref<Record<string, string | number | null>>({})
const fieldInputTypes = ref<Record<string, string>>({})
//const gameDisplaySettings = ref<string | null>(null)
const gameSettingsUpdates = ref<Record<string, string>>({})
const gameSettingsInvalid = ref<boolean>(false)

const { enableLogin } = useFeatureFlags()
const authStore = useAuthStore()
const isLoggedIn = computed(() => authStore.isLoggedIn)
const accessToken = computed(() => authStore.accessToken)
const { createProgressNotification } = useProgressNotifications()
const emit = defineEmits<{
  (
    event: 'submitted',
    payload: { issueNumber: number; issueUrl: string; createdAt: string },
  ): void
}>()
const PROGRESS_STAGE_CONFIG = {
  uploadingImages: {
    title: 'Uploading images',
    message: 'Sending screenshots to the server…',
    icon: 'cloud_upload',
    progress: 'indeterminate' as const,
  },
  gettingUrls: {
    title: 'Getting image links',
    message: 'Finalising secure URLs for your screenshots…',
    icon: 'link',
    progress: 'indeterminate' as const,
  },
  generatingMarkdown: {
    title: 'Generating report',
    message: 'Compiling your answers into GitHub-ready markdown…',
    icon: 'description',
    progress: 'indeterminate' as const,
  },
  submittingGithub: {
    title: 'Submitting to GitHub',
    message: 'Creating your report issue…',
    icon: 'fab fa-github',
    progress: 'indeterminate' as const,
  },
}

type ProgressStageKey = keyof typeof PROGRESS_STAGE_CONFIG

type ProgressHandle = ReturnType<typeof createProgressNotification> | null
let progressHandle: ProgressHandle = null

const updateProgressStage = (stage: ProgressStageKey) => {
  const config = PROGRESS_STAGE_CONFIG[stage]
  if (!config) return
  if (!progressHandle) {
    progressHandle = createProgressNotification(config)
  } else {
    progressHandle.update(config)
  }
}

const finishProgress = (delayMs = 2500) => {
  if (progressHandle) {
    progressHandle.finish(delayMs)
    progressHandle = null
  }
}

const dismissProgress = () => {
  if (progressHandle) {
    progressHandle.dismiss()
    progressHandle = null
  }
}

// Screenshot/asset upload state
const manualInputMode = ref(!(enableLogin && isLoggedIn.value))
const generateFromScreenshots = ref(enableLogin && isLoggedIn.value && !manualInputMode.value)
const inGameImages = ref<File[]>([])
const inGameImageUrls = ref<string[]>([])
const additionalNoteImages = ref<File[]>([])
const additionalNoteImageUrls = ref<string[]>([])
const isUploadingInGame = ref(false)
const isUploadingNotes = ref(false)
const manualToggleRef = ref<HTMLElement | null>(null)

const inGameFileInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const notesFileInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

// List of field ids whose values should be overwritten from previousSubmission
const initOverwriteFields = ['app_id', 'game_name', 'launcher', 'average_battery_power_draw']

// List of fields to be handled specially in the template; ignore them in the initFormData function
const gameSettingsFields = ['game_display_settings', 'game_graphics_settings']


const initFormData = async () => {
  const data = await gameReportTemplate()

  if (data?.schema && data.schema.properties) {
    const mapping: Record<string, string> = {}
    const schemaProps = data.schema.properties as Record<string, { type: string }>
    Object.entries(schemaProps).forEach(([label, prop]) => {
      mapping[label] = prop.type === 'number' ? 'number' : 'text'
    })
    fieldInputTypes.value = mapping
  }

  const tempFormValues: Record<string, string | number | null> = {}

  // Initialize form values with defaults or empty strings
  if (data?.template?.body) {
    data?.template?.body.forEach(field => {
      if (field.type === 'input' && field.id) {
        tempFormValues[field.id] = field.attributes.value || ''
      } else if (field.type === 'dropdown' && field.id) {
        const options = field.attributes.options || []
        if (field.attributes.default !== undefined && options.length > 0) {
          tempFormValues[field.id] = String(options[field.attributes.default]) || String(options[0])
        }
      }
      // Add additional data
      if (field.type !== 'markdown' && field.id) {
        if (field.id === 'game_name' && props.gameName) {
          tempFormValues[field.id] = props.gameName || ''
        } else if (field.id === 'app_id' && props.appId) {
          tempFormValues[field.id] = props.appId || ''
        }
      }
    })

    // Override values with ones from a previous submission
    if (props.previousSubmission) {
      Object.keys(props.previousSubmission).forEach(key => {
        if (initOverwriteFields.includes(key)) {
          const newVal = props.previousSubmission?.[key]
          if (newVal !== undefined) {
            tempFormValues[key] = newVal
          }
        }
      })
    }

    // Import values from localStorage
    const importedFormValues = loadSavedFormValues()
    // Combine previousSubmission values and values pulled from local storage.
    // I did this so that this can be passed to the GameSettingsFields component
    if (importedFormValues) {
      previousFormValues.value = { ...props.previousSubmission, ...importedFormValues }
    } else if (props.previousSubmission) {
      previousFormValues.value = props.previousSubmission
    }
    // Override ALL values with those pulled from localStorage
    if (importedFormValues) {
      Object.keys(importedFormValues).forEach(key => {
        const newVal = importedFormValues[key]
        if (newVal !== undefined) {
          tempFormValues[key] = newVal
        }
      })
    }
  }

  formValues.value = tempFormValues
  formData.value = data
}

// Load saved form state if available.
const loadSavedFormValues = (): Record<string, string | number | null> | null => {
  const saved = localStorage.getItem(`gameReportForm-${props.gameName}`)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return parsed.formValues || null
      } else {
        localStorage.removeItem(`gameReportForm-${props.gameName}`)
      }
    } catch (e) {
      console.error('Error parsing saved form state', e)
      localStorage.removeItem(`gameReportForm-${props.gameName}`)
    }
  }
  return null
}

// Store form state in local storage
const saveFormValuesState = () => {
  const state = {
    timestamp: Date.now(),
    formValues: { ...formValues.value, ...gameSettingsUpdates.value },
  }
  localStorage.setItem(`gameReportForm-${props.gameName}`, JSON.stringify(state))
}

// Clear saved form state (for instance, when clicking cancel).
const clearFormState = () => {
  localStorage.removeItem(`gameReportForm-${props.gameName}`)
}

// Clear form data
const clearForm = () => {
  localStorage.removeItem(`gameReportForm-${props.gameName}`)
  formData.value = null
  initFormData()
}

const getSections = () => {
  if (!formData.value || !formData.value.template.body) {
    return []
  }

  const sections: Array<{ markdown: string; fields: GitHubIssueTemplateBody[] }> = []
  let currentSection: { markdown: string; fields: GitHubIssueTemplateBody[] } | null = null

  formData.value.template.body.forEach((field) => {
    if (field.type === 'markdown') {
      // Start a new section with the current markdown content
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = { markdown: field.attributes.value, fields: [] }
    } else {
      // Add input, dropdown, or textarea fields to the current section
      if (!currentSection) {
        // If no markdown has been encountered yet, create a default section
        currentSection = { markdown: '', fields: [] }
      }
      currentSection.fields.push(field)
    }
  })

  // Add the last section if it exists
  if (currentSection) {
    sections.push(currentSection)
  }

  return sections
}

const handleGameSettingsUpdate = (
  fieldId: string,
  newValue: { title: string; items: { key: string; value: string }[] }[],
) => {
  gameSettingsUpdates.value[fieldId] = newValue
    // Only include sections that have at least one item
    .filter(section => section.items.length > 0)
    .map(section => {
      const itemsMarkdown = section.items
        .filter(item => item.key && item.key.trim() !== '' && item.value && item.value.trim() !== '')
        .map(item => `- **${item.key}:** ${item.value}`)
        .join('\n')
      // If no items were found, return an empty string
      if (itemsMarkdown.trim() === '') {
        return ''
      }
      // If the section title is non-empty, prepend it as a level-4 header.
      // Otherwise, just return the items' markdown.
      return section.title.trim() !== ''
        ? `#### ${section.title}\n\n${itemsMarkdown}\n\n`
        : itemsMarkdown
    })
    .join('\n')
  saveFormValuesState()
}

//const getLabelWithAsterisk = (label: string, required: boolean | undefined): string => {
//  return required ? `${label} *` : label
//}

const runFieldRules = (field: GitHubIssueTemplateBody): Array<(value: string | number | null) => true | string> => {
  const rules: Array<(value: string | number | null) => true | string> = []
  if (!formData.value || !formData.value.schema) {
    return rules
  }

  // Schema defined on GitHub
  const schema = formData.value.schema as GitHubReportIssueBodySchema

  // Additional Regex rules
  const customRegexRules: Record<string, RegExp> = {
    // undervolt_applied should either be blank or match "number/number/number"
    undervolt_applied: /^$|^\d+\/\d+\/\d+$/,
  }

  // Only validate non-markdown fields that have an id.
  if (field.type !== 'markdown' && field.id) {
    // Use the field label if available, otherwise fallback to field.id.
    const label = field.attributes && field.attributes.label ? field.attributes.label : field.id

    // First add custom rules before evaluating the others
    const regexRule = customRegexRules[field.id]
    if (regexRule) {
      rules.push(value => {
        // Allow blank values.
        if (value === null || value === undefined || String(value).trim() === '') {
          return true
        }
        return regexRule.test(String(value)) || `${label} must be in the specified format.`
      })
    }

    // Lookup the corresponding schema using the label.
    const schemaProp = schema.properties[label] as GitHubReportIssueBodySchemaProperty | undefined
    if (!schemaProp) {
      return rules // No schema defined for this field.
    }

    if (schemaProp.type === 'string') {
      const minLength = schemaProp.minLength
      if (minLength) {
        let minLengthRuleMessage = `${label} must be at least ${minLength} characters long.`
        if (gameSettingsFields.includes(field.id) && field.id in gameSettingsUpdates.value) {
          minLengthRuleMessage = `${label} must contain at least one option.`
        }
        rules.push(value =>
          String(value).length >= minLength ||
          minLengthRuleMessage,
        )
      }
      const maxLength = schemaProp.maxLength
      if (maxLength) {
        rules.push(value =>
          String(value).length <= maxLength ||
          `${label} must not exceed ${maxLength} characters.`,
        )
      }
      const propEnum = schemaProp.enum
      if (propEnum) {
        rules.push(value =>
          propEnum.includes(String(value)) ||
          `${label} must be one of ${propEnum.join(', ')}.`,
        )
      }
    } else if (schemaProp.type === 'number') {
      rules.push(value => {
        const num = Number(value)
        return !isNaN(num) || `${label} must be a valid number.`
      })
      const exclusiveMinimum = schemaProp.exclusiveMinimum
      if (exclusiveMinimum !== undefined) {
        rules.push(value => {
          const num = Number(value)
          return num >= exclusiveMinimum ||
            `${label} must be greater or equal to ${exclusiveMinimum}.`
        })
      }
      const propEnum = schemaProp.enum
      if (propEnum) {
        rules.push(value => {
          const num = Number(value)
          return propEnum.includes(String(num)) ||
            `${label} must be one of ${propEnum.join(', ')}.`
        })
      }
    }
  }
  return rules
}

const validateForm = (): boolean => {
  if (!formData.value || !formData.value.schema) {
    return true
  }
  const errors: Record<string, string>[] = []
  const isInGameImageMode = enableLogin && isLoggedIn.value && !manualInputMode.value

  if (formData.value && formData.value.template && formData.value.template.body) {
    formData.value.template.body.forEach(field => {
      if (field.type !== 'markdown' && field.id) {
        // Skip validation for the in-game settings fields if we are in image mode
        if (isInGameImageMode && gameSettingsFields.includes(field.id)) {
          return
        }

        // Retrieve the field's value.
        const fieldId = field.id
        let value = formValues.value[fieldId]
        let isGameSettings = 'false'
        if (gameSettingsFields.includes(fieldId) && fieldId in gameSettingsUpdates.value) {
          value = gameSettingsUpdates.value[fieldId]
          isGameSettings = 'true'
        }
        // Get the rules for this field.
        const rules = runFieldRules(field)
        // Run each rule and collect errors.
        rules.forEach(rule => {
          const result = rule(value ?? '')
          if (result !== true) {
            errors.push({ isGameSettings, message: result })
          }
        })
      }
    })
  }

  gameSettingsInvalid.value = false
  if (errors.length > 0) {
    errors.forEach(error => {
      if (error.isGameSettings === 'true') {
        gameSettingsInvalid.value = true
      }
      console.error(`Validation error: ${error.message}`)
      $q.notify({
        type: 'negative',
        message: error.message as string,
      })
    })
    return false
  }
  return true
}

// Custom dialog related (for non-authenticated submission):
const confirmDialog = ref(false)
const pendingBaseUrl = ref('')

// Image uploading helpers and state management
const SINGLE_IMAGE_MAX_BYTES = 1 * 1024 * 1024
const MAX_IN_GAME_IMAGES = 7
const MAX_IMAGES_PER_REQUEST = 7

function validateImageList(files: File[], opts: { max?: number } = {}): string | null {
  const { max } = opts
  if (max && files.length > max) {
    return `Too many images selected (${files.length}). Maximum allowed is ${max}.`
  }
  for (const f of files) {
    if (f.size > SINGLE_IMAGE_MAX_BYTES) {
      return `Image too large: ${f.name} is ${f.size} bytes (max ${SINGLE_IMAGE_MAX_BYTES}). Images cannot be more than 1MB each.`
    }
  }
  return null
}

function chunkFiles<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function uploadImages(files: File[], token: string): Promise<string[]> {
  if (!files || files.length === 0) return []
  const urls: string[] = []
  for (const batch of chunkFiles(files, MAX_IMAGES_PER_REQUEST)) {
    const fd = new FormData()
    for (const f of batch) {
      fd.append('images', f, f.name || `image-${Date.now()}`)
    }
    const r = await fetch('https://asset-upload.deckverified.games/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: fd,
    })
    const text = await r.text()
    if (!r.ok) {
      throw new Error(`Asset upload failed (${r.status}): ${text}`)
    }
    let js: { results?: Array<{ url?: string }> }
    try {
      js = JSON.parse(text || '{}')
    } catch (e) {
      throw new Error(`Invalid JSON from server: ${String(e)}`)
    }
    const results = Array.isArray(js?.results) ? js.results : []
    for (const it of results) {
      if (it && typeof it.url === 'string' && it.url) {
        urls.push(it.url)
      }
    }
  }
  return urls
}

function handleInGameFilesAdded(files: readonly File[]) {
  const list = Array.from(files || [])
  const combined = [...inGameImages.value, ...list]
  const err = validateImageList(combined, { max: MAX_IN_GAME_IMAGES })
  if (err) {
    $q.notify({ type: 'warning', message: err })
    return
  }
  const tooBig = list.find(f => f.size > SINGLE_IMAGE_MAX_BYTES)
  if (tooBig) {
    $q.notify({ type: 'warning', message: `Image too large: ${tooBig.name}. Max size is 1MB.` })
    return
  }
  inGameImages.value = combined
}

function handleNotesFilesAdded(files: readonly File[]) {
  const list = Array.from(files || [])
  const tooBig = list.find(f => f.size > SINGLE_IMAGE_MAX_BYTES)
  if (tooBig) {
    $q.notify({ type: 'warning', message: `Image too large: ${tooBig.name}. Max size is 1MB.` })
    return
  }
  additionalNoteImages.value = [...additionalNoteImages.value, ...list]
}

function removeInGameImage(idx: number) {
  inGameImages.value = inGameImages.value.filter((_, i) => i !== idx)
}

function removeNotesImage(idx: number) {
  additionalNoteImages.value = additionalNoteImages.value.filter((_, i) => i !== idx)
}

function openInGamePicker() {
  const v = inGameFileInput.value
  const el: HTMLInputElement | null = Array.isArray(v) ? (v[0] ?? null) : v
  if (el) {
    el.click()
  }
}

function openNotesPicker() {
  const v = notesFileInput.value
  const el: HTMLInputElement | null = Array.isArray(v) ? (v[0] ?? null) : v
  if (el) {
    el.click()
  }
}

function onInGameFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input?.files ? Array.from(input.files) : []
  if (files.length) handleInGameFilesAdded(files)
  if (input) input.value = ''
}

function onNotesFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input?.files ? Array.from(input.files) : []
  if (files.length) handleNotesFilesAdded(files)
  if (input) input.value = ''
}

function onDropInGame(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
  if (files.length) handleInGameFilesAdded(files)
}

function onDropNotes(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
  if (files.length) handleNotesFilesAdded(files)
}

watch(manualInputMode, (v) => {
  // Keep generateFromScreenshots in sync with manualInputMode and login state
  generateFromScreenshots.value = enableLogin && isLoggedIn.value && !v
  // When switching to manual input, clear screenshots
  if (v) {
    inGameImages.value = []
    inGameImageUrls.value = []
  }
  // Persist preference
  try {
    localStorage.setItem(`gameReportForm-${props.gameName}-manualInputMode`, JSON.stringify(!!v))
  } catch {
    // ignore
  }
  // After mode change, scroll the toggle into view on small screens to reduce perceived jump
  nextTick(() => {
    try {
      if ($q.screen.lt.sm && manualToggleRef.value) {
        manualToggleRef.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } catch {
      // ignore
    }
  })
})

// Keep generateFromScreenshots in sync with login state changes (without overriding manualInputMode)
watch(isLoggedIn, (logged) => {
  if (!logged) {
    manualInputMode.value = true
  }
  generateFromScreenshots.value = enableLogin && logged && !manualInputMode.value
})

const submitForm = async () => {
  dismissProgress()

  // First trigger QForm validation styling:
  if (!reportForm.value.validate() || !validateForm()) {
    // QForm.validate() will mark invalid fields with error styling.
    return
  }

  // If using screenshot mode, ensure images are valid
  if (enableLogin && isLoggedIn.value && !manualInputMode.value) {
    const err = validateImageList(inGameImages.value, { max: MAX_IN_GAME_IMAGES })
    if (err) {
      $q.notify({ type: 'negative', message: err })
      return
    }
    if (inGameImages.value.length === 0) {
      $q.notify({
        type: 'warning',
        message: 'Please add screenshots for In-Game Settings or turn off "Generate in-game settings from screenshots".',
      })
      return
    }
  }

  // Upload images (when logged in)
  inGameImageUrls.value = []
  additionalNoteImageUrls.value = []

  const shouldUploadAssets = enableLogin && isLoggedIn.value && accessToken.value
  const hasInGameUploads = shouldUploadAssets && !manualInputMode.value && inGameImages.value.length > 0
  const hasAdditionalUploads = shouldUploadAssets && additionalNoteImages.value.length > 0

  if (shouldUploadAssets && (hasInGameUploads || hasAdditionalUploads)) {
    updateProgressStage('uploadingImages')
  }

  if (shouldUploadAssets) {
    try {
      if (hasInGameUploads) {
        isUploadingInGame.value = true
        inGameImageUrls.value = await uploadImages(inGameImages.value, accessToken.value as string)
      }
    } catch (e: unknown) {
      isUploadingInGame.value = false
      const msg = e instanceof Error ? e.message : String(e)
      $q.notify({ type: 'negative', message: `In-Game screenshots upload failed: ${msg}` })
      dismissProgress()
      return
    } finally {
      isUploadingInGame.value = false
    }

    try {
      if (hasAdditionalUploads) {
        isUploadingNotes.value = true
        additionalNoteImageUrls.value = await uploadImages(additionalNoteImages.value, accessToken.value as string)
      }
    } catch (e: unknown) {
      isUploadingNotes.value = false
      const msg = e instanceof Error ? e.message : String(e)
      $q.notify({ type: 'negative', message: `Additional Notes image upload failed: ${msg}` })
      dismissProgress()
      return
    } finally {
      isUploadingNotes.value = false
    }

    if (hasInGameUploads || hasAdditionalUploads) {
      updateProgressStage('gettingUrls')
    }
  }

  // Build an array to accumulate markdown sections.
  updateProgressStage('generatingMarkdown')
  const sections: string[] = []
  const isInGameImageMode =
    enableLogin && isLoggedIn.value && !manualInputMode.value && inGameImageUrls.value.length > 0

  // Loop over each form field (excluding game settings fields)
  if (formData.value && formData.value.template && formData.value.template.body) {
    formData.value.template.body.forEach(field => {
      // Only handle non-markdown fields that have an id.
      if (field.type !== 'markdown' && field.id) {
        // Use the field label if available, otherwise default to the id.
        const label = field.attributes && field.attributes.label ? field.attributes.label : field.id

        // Get the corresponding value from formValues.
        let value: string | number | null | undefined = formValues.value[field.id]
        // Check if this was for game settings. If it is, update value from that
        if (gameSettingsFields.includes(field.id) && field.id in gameSettingsUpdates.value) {
          value = gameSettingsUpdates.value[field.id]
        }

        // Default string
        let valString =
          value !== null && value !== undefined && String(value).trim() !== ''
            ? String(value)
            : '_No response_'

        // In screenshot mode, force Game Graphics Settings to "_No response_"
        if (isInGameImageMode && label === 'Game Graphics Settings') {
          valString = '_No response_'
        }

        // Replace Game Display Settings with image URLs when using screenshot mode
        if (isInGameImageMode && label === 'Game Display Settings') {
          valString = inGameImageUrls.value
            .map((url) => `![Image](${url})`)
            .join('\n')
        }

        // Append Additional Notes images (not OCR'd)
        if (enableLogin && isLoggedIn.value && label === 'Additional Notes' && additionalNoteImageUrls.value.length > 0) {
          const urlsMd = additionalNoteImageUrls.value
            .map((url) => `![Image](${url})`)
            .join('\n')
          valString = (valString === '_No response_' || valString.trim() === '' ? '' : `${valString}\n\n`) + urlsMd
        }

        sections.push(`### ${label}\n\n${valString}`)
      }
    })
  }

  // Combine all sections into a final markdown report.
  const reportMarkdown = sections.join('\n\n')

  // If logged in and feature flag enabled, create issue via GitHub API
  if (shouldUploadAssets) {
    try {
      updateProgressStage('submittingGithub')
      const response = await fetch('https://api.github.com/repos/DeckSettings/game-reports-steamos/issues', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.value}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: isInGameImageMode ? '(Report submitted with images from Deck Verified website)' : '(Report submitted from Deck Verified Website)',
          body: reportMarkdown,
        }),
      })

      const raw = await response.text()
      if (!response.ok) {
        let detail = raw
        try {
          const parsed = JSON.parse(raw) as { message?: string }
          if (parsed?.message) detail = parsed.message
        } catch {
          // ignore parse errors
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('GitHub rejected the request. Please confirm you are signed in and have granted the required permissions.')
        }
        throw new Error(detail || `GitHub issue creation failed (${response.status})`)
      }

      const js = JSON.parse(raw)
      const url: string | undefined = js?.html_url
      $q.notify({ type: 'positive', message: 'Issue created successfully on GitHub.' })
      // if (url) window.open(url, '_blank', 'noopener,noreferrer')
      finishProgress()
      if (typeof js?.number === 'number' && typeof js?.created_at === 'string' && url) {
        emit('submitted', {
          issueNumber: js.number,
          issueUrl: url,
          createdAt: js.created_at,
        })
      }
      return
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      $q.notify({ type: 'negative', message: `Failed to create GitHub issue: ${msg}` })
      dismissProgress()
      return
    }
  }

  // Title placholder
  const title = `(DON'T EDIT THIS TITLE) - Review the generated form below. When you are happy, click "Create".`

  // Fallback: open a confirm dialog that redirects to GitHub with pre-filled body
  let baseUrl =
    'https://github.com/DeckSettings/game-reports-steamos/issues/new?template=none&assignees=&labels=&projects=&title=' +
    encodeURIComponent(title)
  baseUrl += '&body=' + encodeURIComponent(reportMarkdown)

  // console.log(reportMarkdown)
  // console.log('Redirecting to:', baseUrl)
  // window.open(baseUrl, '_blank')

  // Instead of immediately opening GitHub, store the URL and open our custom dialog.
  pendingBaseUrl.value = baseUrl
  confirmDialog.value = true
  finishProgress(1500)
}

// Called when the user clicks "Login to GitHub" in the dialog.
const onConfirmDialogLogin = () => {
  window.open('https://github.com/login', '_blank', 'noopener,noreferrer')
}

// Called when the user clicks "Continue" in the dialog.
const onConfirmDialogContinue = () => {
  window.open(pendingBaseUrl.value, '_blank', 'noopener,noreferrer')
  confirmDialog.value = false
}

// Called when the user clicks "Cancel" in the dialog.
const onConfirmDialogCancel = () => {
  confirmDialog.value = false
}

onMounted(async () => {
  await initFormData()
  // Initialize modes (restore manualInputMode from storage if available)
  try {
    const raw = localStorage.getItem(`gameReportForm-${props.gameName}-manualInputMode`)
    if (raw !== null) {
      manualInputMode.value = !!JSON.parse(raw)
    } else {
      manualInputMode.value = !(enableLogin && isLoggedIn.value)
    }
  } catch {
    manualInputMode.value = !(enableLogin && isLoggedIn.value)
  }
  // Ensure manual input when logged out on mount
  if (!isLoggedIn.value) {
    manualInputMode.value = true
  }
  generateFromScreenshots.value = enableLogin && isLoggedIn.value && !manualInputMode.value
})

onUnmounted(() => {
  dismissProgress()
  console.log('Report form dialog closed')
})

// Save form state whenever formValues changes.
watch(formValues, () => {
  // NOTE: This is also executed from handleGameSettingsUpdate() above
  saveFormValuesState()
}, { deep: true })

</script>

<template>
  <q-card class="report-card"
          :class="displayFullscreen ? 'fullscreen' : ''"
          :style="displayFullscreen ? 'margin-top:58px;' : ''">
    <q-card-section class="report-header">
      <div class="header-content">
        <div class="header-info">
          <q-img
            v-if="gameBanner"
            class="header-image"
            :src="gameBanner"
            alt="Game Banner"
            fit="contain"
          >
            <template v-slot:error>
              <img
                src="~/assets/banner-placeholder.png"
                alt="Placeholder" />
            </template>
          </q-img>
          <div class="header-details">
            <div class="header-title">{{ gameName }}</div>
            <div v-if="appId" class="header-subtitle">App ID: {{ appId }}</div>
          </div>
        </div>
        <div class="header-actions">
          <div v-if="showCancelButton" class="header-action header-action--cancel">
            <PrimaryButton
              class="header-btn"
              label="Cancel"
              color="negative"
              icon="close"
              full-width
              :dense="$q.screen.lt.sm"
              @click="clearFormState"
              v-close-popup
            />
          </div>
          <div v-if="showClearButton" class="header-action header-action--cancel">
            <PrimaryButton
              class="header-btn"
              label="Clear Form"
              color="warning"
              icon="clear_all"
              full-width
              :dense="$q.screen.lt.sm"
              @click="clearForm"
            />
          </div>
          <div class="header-action header-action--submit lt-md">
            <PrimaryButton
              class="header-btn"
              label="Submit On GitHub"
              color="positive"
              icon="fab fa-github"
              icon-right="open_in_new"
              full-width
              :dense="$q.screen.lt.sm"
              @click="submitForm"
            />
          </div>
        </div>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-section class="scroll form-body">
      <q-spinner v-if="!formData" />
      <div v-else>
        <q-banner
          v-if="enableLogin && !isLoggedIn"
          dense
          class="q-mb-md"
          inline-actions
        >
          Tip: Sign in with GitHub for a better experience. You’ll be able to upload screenshots and submit directly.
          <template #action>
            <q-btn color="primary" label="Sign in" @click="authStore.startLogin" />
          </template>
        </q-banner>

        <q-form ref="reportForm" @submit.prevent="submitForm">
          <div v-for="(section, sIndex) in getSections()" :key="sIndex" class="form-section">
            <div class="section-layout">
              <aside class="section-aside"
                     :class="{'section-aside--sticky': section.markdown && section.markdown.includes('## In-Game Settings')}">
                <template v-if="section.markdown && section.markdown.includes('## In-Game Settings')">
                  <div class="in-game-settings-head">
                    <h2>In-Game Settings</h2>
                    <template v-if="$q.screen.gt.sm && enableLogin && isLoggedIn && !manualInputMode">
                      <p>
                        Upload up to <strong>{{ MAX_IN_GAME_IMAGES }}</strong> screenshots (<strong>max 1MB
                        each</strong>).
                        <br />
                        They must clearly show your in-game settings; unclear images can prevent OCR from producing
                        useful results.
                        <br />
                        After submission, carefully review the generated settings and fix anything that looks incorrect.
                      </p>
                    </template>
                    <template v-else>
                      <p v-if="$q.screen.lt.md && enableLogin && isLoggedIn">
                        Ensure the selected images clearly show your in-game settings; unclear images can prevent OCR
                        from producing useful results.
                        <br />
                        You can upload up to <strong>{{ MAX_IN_GAME_IMAGES }}</strong> screenshots (<strong>max 1MB
                        each</strong>).
                        <br />
                        After submission, carefully review the generated settings and fix anything that looks incorrect.
                      </p>
                      <p v-if="$q.screen.lt.md && enableLogin && isLoggedIn">
                        If you choose to toggle ON <strong>Manually input in-game settings</strong>, try to mirror the
                        in-game layout and values as closely as possible.
                      </p>
                      <p v-else>
                        Enter your game’s display and graphics settings. Try to mirror the in-game layout and values as
                        closely as possible.
                      </p>
                      <p>
                        Many games group settings into categories.
                        <q-img
                          lazy
                          :src="LasOfUsGraphicSettingsImage"
                          class="lt-sm q-my-lg"
                          fit="contain"
                          style="width:85vw; max-width:85vw; display:block; margin:0;" />
                        <q-img
                          lazy
                          :src="LasOfUsGraphicSettingsImage"
                          class="lt-md gt-xs q-ml-lg q-my-sm"
                          style="max-width:400px;display:block;float:right;" />
                        <span class="sm-hide xs-hide">
                          When they do it might look like this:
                          <br /><br />
                          <ZoomableImage
                            :src="LasOfUsGraphicSettingsImage" />
                        </span>
                        <br />
                        To create a new category, click the
                        <q-btn
                          dense
                          glossy
                          size="xs"
                          :ripple="false"
                          color="primary"
                          class="q-ma-none cursor-inherit"
                        >
                          <q-icon left size="3em" name="add_circle" />
                          <div>ADD SECTION</div>
                        </q-btn>
                        button.
                        <br />
                        To add a new setting within a category, click the
                        <q-btn
                          dense
                          glossy
                          size="xs"
                          :ripple="false"
                          color="primary"
                          class="q-ma-none cursor-inherit"
                        >
                          <q-icon left size="3em" name="add_circle" />
                          <div>ADD OPTION</div>
                        </q-btn>
                        button.
                        You can rearrange or move any setting by dragging the
                        <q-icon name="drag_handle" color="secondary" size="16px" inline />
                        icon.
                        <br /><br />
                        If a game doesn’t split its settings into sections or has no “Display”/“Graphics” category, just
                        list resolution and related details under the <strong>Game Display Settings</strong> section.
                      </p>
                    </template>
                  </div>
                </template>
                <template v-else>
                  <ReportFormMarkdown :markdown="section.markdown" />
                </template>
              </aside>
              <div class="section-body">
                <div
                  v-for="(field, fIndex) in section.fields"
                  :key="fIndex"
                  class="field-card"
                  :class="{
                    'field-card--invalid':
                      'id' in field &&
                      gameSettingsFields.includes(field.id) &&
                      gameSettingsInvalid &&
                      field.validations?.required,
                    'field-card--hidden':
                      'id' in field &&
                      field.id === 'game_graphics_settings' &&
                      !manualInputMode
                  }"
                >
                  <template v-if="'id' in field && !gameSettingsFields.includes(field.id)">
                    <!-- Render input fields -->
                    <template v-if="field.type === 'input'">
                      <div class="field-title">
                        {{ field.attributes.label }}
                      </div>
                      <div v-if="field.attributes.description" class="field-description">
                        {{ field.attributes.description || '' }}
                      </div>
                      <q-input
                        filled
                        dense
                        standout
                        v-model="formValues[field.id]"
                        :type="fieldInputTypes[field.attributes.label] == 'number' ? 'number' : 'text'"
                        :hint="field.validations?.required ? '(THIS FIELD IS REQUIRED)' : ''"
                        :rules="runFieldRules(field)"
                      />
                    </template>
                    <!-- Render dropdown fields -->
                    <template v-else-if="field.type === 'dropdown'">
                      <div class="field-title">
                        {{ field.attributes.label }}
                      </div>
                      <div v-if="field.attributes.description" class="field-description">
                        {{ field.attributes.description || '' }}
                      </div>
                      <q-select
                        filled
                        dense
                        standout
                        v-model="formValues[field.id]"
                        :options="field.attributes.options || []"
                        :hint="field.validations?.required ? '(THIS FIELD IS REQUIRED)' : ''"
                        emit-value
                        map-options
                      />
                    </template>
                    <!-- Render textarea fields -->
                    <template v-else-if="field.type === 'textarea'">
                      <div class="field-title">
                        {{ field.attributes.label }}
                      </div>
                      <div v-if="field.attributes.description" class="field-description">
                        {{ field.attributes.description || '' }}
                      </div>
                      <q-input
                        filled
                        dense
                        standout
                        type="textarea"
                        autogrow
                        v-model="formValues[field.id]"
                        :hint="field.validations?.required ? '(THIS FIELD IS REQUIRED)' : ''"
                        :rules="runFieldRules(field)"
                      />
                      <div
                        v-if="enableLogin && isLoggedIn && field.attributes?.label === 'Additional Notes'"
                        class="q-mt-md"
                      >
                        <div class="uploader">
                          <div
                            class="uploader-drop"
                            @dragover.prevent
                            @drop.prevent="onDropNotes"
                          >
                            <div>Drag images here or</div>
                            <q-btn color="primary" dense label="Choose images" @click="openNotesPicker" />
                            <input
                              ref="notesFileInput"
                              type="file"
                              accept="image/*"
                              multiple
                              style="display:none"
                              @change="onNotesFileInputChange"
                            />
                          </div>
                          <div v-if="additionalNoteImages.length" class="uploader-list q-mt-sm">
                            <div
                              v-for="(img, idx) in additionalNoteImages"
                              :key="img.name + idx"
                              class="uploader-list__item"
                            >
                              <q-icon name="image" size="16px" class="q-mr-xs" />
                              <span class="ellipsis">{{ img.name }}</span>
                              <q-btn flat dense size="sm" icon="close" @click="removeNotesImage(idx)" />
                            </div>
                          </div>
                        </div>
                        <div v-if="isUploadingNotes" class="q-mt-sm">
                          <q-spinner size="sm" />
                          <span class="q-ml-sm">Uploading Additional Notes images…</span>
                        </div>
                      </div>
                    </template>
                  </template>

                  <!-- In-game settings fields (Display/Graphics) -->
                  <template v-else-if="'id' in field && gameSettingsFields.includes(field.id)">
                    <div>
                      <!-- Toggle Button row. Shown above Game Display Settings only when logged in -->
                      <template v-if="field.id === 'game_display_settings' && enableLogin && isLoggedIn">
                        <div class="in-game-toggle-row" ref="manualToggleRef">
                          <div class="in-game-toggle-row__label">Manually input in-game settings</div>
                          <q-toggle v-model="manualInputMode" color="primary" />
                        </div>
                      </template>

                      <!-- When logged in and using screenshots mode, replace inputs with a single uploader under Display -->
                      <template v-if="enableLogin && isLoggedIn && !manualInputMode">
                        <template v-if="field.id === 'game_display_settings'">
                          <div class="field-title">In-Game Settings Screenshots</div>
                          <div class="field-description">
                            Upload screenshots that show your in-game settings (Display/Graphics). We’ll attach them
                            and run OCR to generate settings in the report.
                            Limit: up to <span class="text-secondary"><strong>{{ MAX_IN_GAME_IMAGES
                            }}</strong> images, <strong>1MB</strong> each</span>.
                          </div>
                          <AdmonitionBanner type="note" class="q-mt-sm q-mb-md">
                            After submitting, the issue will be labeled
                            <span class="gh-note-label">note:ocr-generated-content</span>
                            to indicate it contains OCR-extracted settings that still need review.
                            Open the issue on GitHub and check the in-game settings that were extracted.
                            If everything looks correct, open the issue on GitHub and edit the body (for example, by
                            adding a space at the end). Then save your changes.
                            <q-img
                              class="q-my-sm"
                              src="~/assets/github-edit-issue-button.jpg"
                              alt="Edit Issue On GitHub" />
                            <br />
                            This simple edit signals that the report has been reviewed. If you spot any mistakes in the
                            OCR results, you can also make corrections directly by editing the issue’s markdown. Once
                            you save your edits, the label will be cleared.
                          </AdmonitionBanner>
                          <div class="uploader q-mt-sm">
                            <div
                              class="uploader-drop"
                              @dragover.prevent
                              @drop.prevent="onDropInGame"
                            >
                              <div>Drag images here or</div>
                              <q-btn color="primary" dense label="Choose images" @click="openInGamePicker" />
                              <input
                                ref="inGameFileInput"
                                type="file"
                                accept="image/*"
                                multiple
                                style="display:none"
                                @change="onInGameFileInputChange"
                              />
                            </div>
                            <div v-if="inGameImages.length" class="uploader-list q-mt-sm">
                              <div
                                v-for="(img, idx) in inGameImages"
                                :key="img.name + idx"
                                class="uploader-list__item"
                              >
                                <q-icon name="image" size="16px" class="q-mr-xs" />
                                <span class="ellipsis">{{ img.name }}</span>
                                <q-btn flat dense size="sm" icon="close" @click="removeInGameImage(idx)" />
                              </div>
                            </div>
                          </div>
                          <div v-if="isUploadingInGame" class="q-mt-sm">
                            <q-spinner size="sm" />
                            <span class="q-ml-sm">Uploading screenshots…</span>
                          </div>
                        </template>
                        <!-- Hide the other in-game field (Graphics) entirely during screenshot mode -->
                      </template>

                      <!-- Otherwise, show input fields -->
                      <template v-else>
                        <GameSettingsFields
                          :fieldData="field"
                          :previousData="previousFormValues?.[field.id] ? String(previousFormValues?.[field.id]) : ''"
                          :invalidData="gameSettingsInvalid"
                          @update="handleGameSettingsUpdate(field.id, $event)"
                        />
                      </template>
                    </div>
                  </template>

                  <template v-else>
                    <!-- Render unsupported fields warning -->
                    <q-banner type="warning">
                      Unsupported field type: {{ field.type }}
                    </q-banner>
                  </template>
                </div>
              </div>
            </div>
            <!-- Add a separator between sections (except after the last section) -->
            <q-separator v-if="sIndex < getSections().length - 1" class="q-my-lg" />
          </div>
        </q-form>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-actions
      align="right"
      class="q-pa-md-md gt-sm"
    >
      <div class="header-action header-action--submit">
        <PrimaryButton
          class="header-btn"
          color="positive"
          icon="fab fa-github"
          icon-right="open_in_new"
          label="Submit On GitHub"
          full-width
          @click="submitForm"
        />
      </div>
    </q-card-actions>
  </q-card>

  <q-dialog v-model="confirmDialog">
    <q-card>
      <q-card-section>
        <div class="text-h6">Confirm Submission</div>
      </q-card-section>
      <q-card-section>
        <p>
          You are about to submit this form to GitHub.
        </p>
        <p>
          Before proceeding, please ensure you are signed into GitHub on this browser.
          If you're not, click the button below to log in.
        </p>
        <div class="q-mx-xl q-my-md">
          <q-btn
            dense
            glossy
            class="full-width"
            color="primary"
            label="Login to GitHub"
            icon="fab fa-github"
            icon-right="open_in_new"
            @click="onConfirmDialogLogin"
          />
        </div>
        <p>
          Otherwise, click <strong>"Continue to GitHub"</strong> below to proceed.
          When you do, a new window will open, taking you to the GitHub Issues page with your
          report details pre-filled.
        </p>
        <p>
          <strong>Important:</strong>
        </p>
        <ul>
          <li>
            Your form will remain open in this window. This way, if any details need to be adjusted,
            you won't lose your work.
          </li>
          <li>
            Any empty fields will be set to <em>"_No response_"</em> in the issue body.
          </li>
        </ul>
        <p>
          Please review your information carefully on GitHub, then click the
          <q-btn
            dense
            size="xs"
            :ripple="false"
            color="positive"
            icon-right="keyboard_return"
            label="Create"
            class="q-ma-none cursor-inherit" />
          &nbsp;<strong>"Create"</strong> button.
          Note that it may take up to an hour for your report to appear on our website, as reports are imported on an
          hourly schedule.
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn glossy label="Cancel" color="negative" icon="close" @click="onConfirmDialogCancel" />
        <q-btn glossy label="Continue to GitHub" color="positive" icon="open_in_new" @click="onConfirmDialogContinue" />
      </q-card-actions>
    </q-card>
  </q-dialog>

</template>

<style scoped>
.report-card {
  width: 100%;
  max-width: 1180px;
  height: 92vh;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--q-dark) 95%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 3px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  z-index: 1000;
}

.report-header {
  padding: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-grow: 1;
  min-width: 0;
}

.header-image {
  height: 60px;
  width: auto;
  max-width: 320px;
  aspect-ratio: 16 / 7;
  border-radius: 10px;
  overflow: hidden;
}

.header-image :deep(img) {
  object-fit: contain;
  height: 100%;
  width: auto;
}

.header-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.header-title {
  font-size: 1.4rem;
  font-weight: 600;
}

.header-subtitle {
  margin-top: 4px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: stretch;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.header-action {
  flex: 0 1 260px;
  min-width: 160px;
  max-width: 280px;
  display: flex;
}

.header-action--cancel {
  flex: 1 1 220px;
  min-width: 140px;
}

.header-action--submit {
  flex: 1 1 260px;
}

.header-action > * {
  flex: 1 1 auto;
}

.header-btn {
  width: 100%;
  margin: 0 !important;
}

.header-btn .q-btn__content {
  gap: 8px;
}

.form-body {
  flex: 1;
  padding: 24px;
}

.scroll {
  overflow-y: auto;
}

.form-section {
  margin-bottom: 48px;
}

.section-layout {
  display: grid;
  grid-template-columns: minmax(0, 350px) minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}

.section-aside {
  position: static;
  padding-right: 6px;
  overflow-x: hidden;
  overflow-wrap: anywhere;
}

.section-aside--sticky {
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.gh-note-label {
  color: white;
  background: color-mix(in srgb, #5319e7 30%, transparent);
  border: 1px solid color-mix(in srgb, white 30%, #5319e7);
  border-radius: 16px;
  padding: 0 8px;
}

@media (max-width: 599.98px) {
  .section-aside--sticky {
    position: static;
    max-height: none;
    overflow-y: visible;
  }
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.field-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.3);
}

.field-card :deep(.q-field) {
  width: 100%;
}

.field-card :deep(.q-field__native),
.field-card :deep(textarea) {
  font-size: 0.95rem;
}

.field-card--invalid {
  border: 1px solid rgba(255, 80, 80, 0.9);
}

.field-card--hidden {
  display: none;
}

.field-title {
  font-size: 1.05rem;
  font-weight: 600;
}

.field-description {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  margin-bottom: 12px;
}

.in-game-settings-head h2 {
  font-size: 1.75rem;
  font-weight: bold;
  line-height: 1.2;
}

.in-game-settings-head p {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

/* Simple uploader styles */
.uploader {
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.uploader-drop {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.uploader-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.uploader-list__item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 6px 8px;
}

.uploader-list__item .ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
}

/* Toggle row aligned to the right with label on the left */
.in-game-toggle-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.in-game-toggle-row__label {
  font-size: 0.95rem;
  opacity: 0.85;
}

@media (max-width: 1023.98px) {
  .report-header {
    padding: 16px;
  }

  .report-card {
    height: auto;
    max-height: none;
  }

  .form-body {
    padding: 16px;
  }

  .form-section {
    margin-bottom: 32px;
  }

  .section-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .section-aside {
    position: static;
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }
}

@media (max-width: 599.98px) {
  .report-card {
    border-radius: 12px;
  }

  .header-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }

  .header-action {
    flex: 1 1 150px;
    min-width: 120px;
    max-width: none;
  }

  .header-action--cancel {
    flex: 1 1 120px;
    min-width: 100px;
  }

  .header-action--submit {
    flex: 1 1 180px;
  }

  .header-title {
    font-size: 1.2rem;
  }

  .header-image {
    display: none;
  }

  .header-details {
    width: 100%;
  }

  .form-body {
    padding: 6px;
  }

  .field-card {
    padding: 12px;
    border-radius: 12px;
  }

  .section-aside {
    padding-left: 6px;
    padding-right: 6px;
  }
}
</style>
