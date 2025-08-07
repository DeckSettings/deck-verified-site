<script setup lang="ts">
import { defineProps, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
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

  if (formData.value && formData.value.template && formData.value.template.body) {
    formData.value.template.body.forEach(field => {
      if (field.type !== 'markdown' && field.id) {
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
    // You might use $q.notify for a nicer UX; here we just use alert.
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

// Custom dialog related:
const confirmDialog = ref(false)
const pendingBaseUrl = ref('')
const submitForm = () => {
  // First trigger QForm validation styling:
  if (!reportForm.value.validate() || !validateForm()) {
    // QForm.validate() will mark invalid fields with error styling.
    return
  }

  // Validate the form values against the schema.
  if (!validateForm()) {
    return
  }

  // Build an array to accumulate markdown sections.
  const sections: string[] = []

  // Loop over each form field (excluding game settings fields)
  // Assuming that props.fieldData.template.body contains the form fields with an "id" and "attributes.label".
  if (formData.value && formData.value.template && formData.value.template.body) {
    formData.value.template.body.forEach(field => {
      // Only handle non-markdown fields that have an id.
      if (field.type !== 'markdown' && field.id) {
        // Use the field label if available, otherwise default to the id.
        const label = field.attributes && field.attributes.label ? field.attributes.label : field.id
        // Get the corresponding value from formValues.
        let value = formValues.value[field.id]
        // Check if this was for game settings. If it is, update value from that
        if (gameSettingsFields.includes(field.id) && field.id in gameSettingsUpdates.value) {
          value = gameSettingsUpdates.value[field.id]
        }
        // If the value is empty, default to "_No response_"
        const valString =
          value !== null && value !== undefined && String(value).trim() !== ''
            ? String(value)
            : '_No response_'
        sections.push(`### ${label}\n\n${valString}`)
      }
    })
  }

  // Combine all sections into a final markdown report.
  const reportMarkdown = sections.join('\n\n')

  // Build the GitHub URL without the template parameter.
  const title = `(DON'T EDIT THIS TITLE) - Review the generated form below. When you are happy, click "Create".`
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
}

// Called when the user clicks "Login to GitHub" in the dialog.
const onConfirmDialogLogin = () => {
  window.open('https://github.com/login', '_blank')
}

// Called when the user clicks "Continue" in the dialog.
const onConfirmDialogContinue = () => {
  window.open(pendingBaseUrl.value, '_blank')
  confirmDialog.value = false
}

// Called when the user clicks "Cancel" in the dialog.
const onConfirmDialogCancel = () => {
  confirmDialog.value = false
}

onMounted(async () => {
  await initFormData()
})

onUnmounted(() => {
  console.log('Report form dialog closed')
})

// Save form state whenever formValues changes.
watch(formValues, () => {
  // NOTE: This is also executed from handleGameSettingsUpdate() above
  saveFormValuesState()
}, { deep: true })


</script>

<template>
  <q-card style="width: 1200px; max-width: 90vw; display: flex; flex-direction: column; height: 90vh;">
    <q-card-section :class="{'q-pa-xs' : $q.screen.lt.md }">
      <div v-if="!$q.screen.lt.sm" class="row items-center no-wrap">
        <div class="col">
          <q-img
            v-if="!$q.screen.lt.md && gameBanner"
            class="form-header-game-image"
            style="width: 100px"
            :src="gameBanner"
            alt="Game Banner">
            <template v-slot:error>
              <img
                src="~/assets/banner-placeholder.png"
                alt="Placeholder" />
            </template>
          </q-img>
          <div class="text-h6">{{ gameName }}</div>
        </div>
        <div class="col-auto self-baseline">
          <q-btn
            glossy
            color="negative"
            icon="close"
            label="Cancel"
            @click="clearFormState"
            v-close-popup />
          <q-btn
            glossy
            v-if="$q.screen.lt.md"
            class="q-ml-md"
            color="positive"
            icon="fab fa-github"
            icon-right="open_in_new"
            label="Submit On GitHub"
            @click="submitForm" />
        </div>
      </div>

      <div v-else class="row items-center no-wrap">
        <div class="col">
          <q-btn
            dense
            glossy
            class="q-pa-sm"
            color="negative"
            icon="close"
            label="Cancel"
            @click="clearFormState"
            v-close-popup />
        </div>
        <div class="col-auto">
          <q-btn
            dense
            glossy
            class="q-ml-md q-pa-sm"
            color="positive"
            icon="fab fa-github"
            icon-right="open_in_new"
            label="Submit On GitHub"
            @click="submitForm" />
        </div>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-section style="max-height: 90vh; overflow-y: auto;" class="scroll">
      <q-spinner v-if="!formData" />
      <div v-else>
        <q-form ref="reportForm" @submit.prevent="submitForm">
          <div v-for="(section, sIndex) in getSections()" :key="sIndex">
            <div class="row">
              <div class="col-md-4">
                <template v-if="section.markdown && section.markdown.includes('## In-Game Settings')">
                  <div class="in-game-settings-head">
                    <h2>In-Game Settings</h2>
                    <p>
                      Add your game settings options here.
                      Match the in-game format as closely as possible.

                      <br />
                      <br />
                      Some games organise their settings into sections.
                      <ZoomableImage :src="LasOfUsGraphicSettingsImage" />
                      You can also do this by clicking the
                      <q-btn
                        dense
                        glossy
                        size="xs"
                        :ripple="false"
                        color="primary"
                        class="q-ma-none cursor-inherit">
                        <q-icon left size="3em" name="add_circle" />
                        <div>ADD SECTION</div>
                      </q-btn>
                      "ADD SECTION" button.
                      <br />
                      <br />
                      You can reorder options or move them between sections by dragging the
                      <q-icon name="drag_handle" color="secondary" size="16px" inline />
                      icon.
                      <br />
                      <br />
                      Use the
                      <q-btn
                        dense
                        glossy
                        size="xs"
                        :ripple="false"
                        color="primary"
                        class="q-ma-none cursor-inherit">
                        <q-icon left size="3em" name="add_circle" />
                        <div>ADD OPTION</div>
                      </q-btn>
                      "ADD OPTION" button to insert new settings.
                      <br />
                      <br />
                      If the game lacks <strong>"Display"</strong> or <strong>"Graphics"</strong> options,
                      list resolution details under the <strong>Game Display Settings</strong> section.
                      If settings aren't separated, include all details under the Display section below.
                    </p>
                  </div>
                </template>
                <template v-else>
                  <ReportFormMarkdown :markdown="section.markdown" />
                </template>
              </div>
              <div class="col-12 col-md-8">
                <div v-for="(field, fIndex) in section.fields" :key="fIndex" class="q-mb-md q-ml-lg">
                  <div v-if="'id' in field && !gameSettingsFields.includes(field.id)">
                    <!-- Render input fields -->
                    <template v-if="field.type === 'input'">
                      <div class="text-h6">
                        {{ field.attributes.label }}
                      </div>
                      <div v-if="field.attributes.description" class="text-caption q-my-sm">
                        {{ field.attributes.description || '' }}
                      </div>
                      <q-input
                        outlined filled
                        v-model="formValues[field.id]"
                        :type="fieldInputTypes[field.attributes.label] == 'number' ? 'number' : 'text'"
                        :hint="field.validations?.required ? '(THIS FIELD IS REQUIRED)' : ''"
                        :rules="runFieldRules(field)"
                      />
                    </template>
                    <!-- Render dropdown fields -->
                    <template v-else-if="field.type === 'dropdown'">
                      <div class="text-h6">
                        {{ field.attributes.label }}
                      </div>
                      <div v-if="field.attributes.description" class="text-caption q-my-sm">
                        {{ field.attributes.description || '' }}
                      </div>
                      <q-select
                        outlined filled
                        v-model="formValues[field.id]"
                        :options="field.attributes.options || []"
                        :hint="field.validations?.required ? '(THIS FIELD IS REQUIRED)' : ''"
                        emit-value
                        map-options
                      />
                    </template>
                    <!-- Render textarea fields -->
                    <template v-else-if="field.type === 'textarea'">
                      <div class="text-h6">
                        {{ field.attributes.label }}
                      </div>
                      <div v-if="field.attributes.description" class="text-caption q-my-sm">
                        {{ field.attributes.description || '' }}
                      </div>
                      <q-input
                        outlined filled
                        type="textarea"
                        autogrow
                        class="full-width"
                        input-class="full-width"
                        style="width: 100%"
                        v-model="formValues[field.id]"
                        :hint="field.validations?.required ? '(THIS FIELD IS REQUIRED)' : ''"
                        :rules="runFieldRules(field)"
                      />
                    </template>
                  </div>
                  <div v-else-if="'id' in field && gameSettingsFields.includes(field.id)">
                    <div :style="gameSettingsInvalid && field.validations?.required ? 'border: thin solid red;' : '' ">
                      <GameSettingsFields
                        :fieldData="field"
                        :previousData="previousFormValues?.[field.id] ? String(previousFormValues?.[field.id]) : ''"
                        :invalidData="gameSettingsInvalid"
                        @update="handleGameSettingsUpdate(field.id, $event)"
                      />
                    </div>
                  </div>
                  <div v-else>
                    <!-- Render unsupported fields warning -->
                    <q-banner type="warning">
                      Unsupported field type: {{ field.type }}
                    </q-banner>
                  </div>
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

    <q-card-actions v-if="!$q.screen.lt.md" align="right" class="q-pa-md-md">
      <!--      <q-btn
              color="negative"
              icon="close"
              label="Cancel"
              @click="clearFormState"
              v-close-popup />-->
      <q-btn
        glossy
        color="positive"
        icon="fab fa-github"
        icon-right="open_in_new"
        label="Submit On GitHub"
        @click="submitForm" />
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
.scroll {
  overflow-y: auto;
}

.in-game-settings-head h2 {
  font-size: 1.75rem;
  font-weight: bold;
  line-height: inherit;
}

.in-game-settings-head p {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

</style>
