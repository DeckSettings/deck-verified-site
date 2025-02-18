<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { gameReportTemplate } from 'src/services/gh-reports'
import type { GameReportForm, GitHubIssueTemplateBody } from '../../../shared/src/game'
import GameSettingsFields from 'components/elements/GameSettingsFields.vue'
import ReportFormMarkdown from 'components/elements/ReportFormMarkdown.vue'
import { useQuasar } from 'quasar'


export default defineComponent({
  components: { GameSettingsFields, ReportFormMarkdown },
  props: {
    gameName: {
      type: String,
      required: true
    },
    appId: {
      type: String,
      required: false
    },
    gameBanner: {
      type: String,
      required: false
    },
    gameBackground: {
      type: String,
      required: false
    },
    previousSubmission: {
      type: Object,
      required: false
    }
  },
  setup(props) {
    const $q = useQuasar()

    const reportForm = ref()
    const formData = ref<GameReportForm | null>(null)
    const formValues = ref<Record<string, string | number | null>>({})
    const fieldInputTypes = ref<Record<string, string>>({})
    //const gameDisplaySettings = ref<string | null>(null)
    const gameSettingsInvalid = ref<boolean>(false)

    // List of field ids whose values should be overwritten from previousSubmission
    const initOverwriteFields = ['launcher']

    // List of fields to be handled specially in the template; ignore them in the initFormData function
    const gameSettingsFields = ['game_display_settings', 'game_graphics_settings']


    const initFormData = async () => {
      const data = await gameReportTemplate()
      formData.value = data

      // Build the mapping from schema properties.
      if (data?.schema && data.schema.properties) {
        const mapping: Record<string, string> = {}
        const schemaProps = data.schema.properties as Record<string, { type: string }>
        Object.entries(schemaProps).forEach(([label, prop]) => {
          mapping[label] = prop.type === 'number' ? 'number' : 'text'
        })
        fieldInputTypes.value = mapping
      }

      // Initialize form values with defaults or empty strings
      if (data?.template?.body) {
        data?.template?.body.forEach(field => {
          if (field.type === 'input' && field.id) {
            formValues.value[field.id] = field.attributes.value || ''
          } else if (field.type === 'dropdown' && field.id) {
            const options = field.attributes.options || []
            if (field.attributes.default !== undefined && options.length > 0) {
              formValues.value[field.id] = String(options[field.attributes.default]) || String(options[0])
              console.log(String(options[field.attributes.default]))
            }
          }
          // Add additional data
          if (field.type !== 'markdown' && field.id) {
            if (field.id === 'game_name' && props.gameName) {
              formValues.value[field.id] = props.gameName || ''
            } else if (field.id === 'app_id' && props.appId) {
              formValues.value[field.id] = props.appId || ''
            }
          }
        })

        // Overwrite values from previousSubmission for specified fields
        if (props.previousSubmission) {
          Object.keys(props.previousSubmission).forEach(key => {
            if (initOverwriteFields.includes(key)) {
              const currentValue = formValues.value[key]
              formValues.value[key] = props.previousSubmission?.[key] ?? currentValue
            }
          })
        }
      }
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

    const gameSettingsUpdates = ref<Record<string, string>>({})
    const handleGameSettingsUpdate = (
      fieldId: string,
      newValue: { title: string; items: { key: string; value: string }[] }[]
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
    }

    const getLabelWithAsterisk = (label: string, required: boolean | undefined): string => {
      return required ? `${label} *` : label
    }

    const getFieldRules = (validations: { required?: boolean } | undefined) => {
      const rules: Array<(value: string | number | null) => true | string> = []

      if (validations?.required) {
        rules.push((value) => !!value || `(THIS FIELD IS REQUIRED)`)
      }

      return rules
    }

    const validateForm = (): boolean => {
      if (!formData.value || !formData.value.schema) {
        return true
      }
      const errors: Record<string, string>[] = []
      const schema = formData.value.schema
      const properties = schema.properties
      const requiredFields: string[] = schema.required || []

      // For each property in the schema, if it is required then check formValues.
      Object.entries(properties).forEach(([propName, propSchema]) => {
        if (requiredFields.includes(propName)) {
          // Convert the property name to the expected field id (e.g. "Game Name" -> "game_name")
          const fieldId = propName.toLowerCase().replace(/\s+/g, '_')
          // Get the corresponding value from formValues.
          let value = formValues.value[fieldId]
          let isGameSettings = 'false'
          // Check if this was for game settings. If it is, update value from that
          if (gameSettingsFields.includes(fieldId) && fieldId in gameSettingsUpdates.value) {
            value = gameSettingsUpdates.value[fieldId]
            console.log(value)
            isGameSettings = 'true'
          }
          if (value === null || value === undefined || String(value).trim() === '') {
            errors.push({
              isGameSettings: isGameSettings,
              message: `${propName} is required.`
            })
          } else if (
            propSchema.type === 'string' &&
            propSchema.minLength &&
            String(value).length < propSchema.minLength
          ) {
            errors.push({
              isGameSettings: isGameSettings,
              message: `${propName} must be at least ${propSchema.minLength} characters long.`
            })
          }
        }
      })

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
            message: error.message as string
          })
        })
        return false
      }
      return true
    }

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
        'https://github.com/DeckSettings/game-reports-steamos/issues/new?assignees=&labels=&projects=&title=' +
        encodeURIComponent(title)
      baseUrl += '&body=' + encodeURIComponent(reportMarkdown)

      // console.log(reportMarkdown)
      // console.log('Redirecting to:', baseUrl)
      window.open(baseUrl, '_blank')
    }

    onMounted(async () => {
      await initFormData()
    })

    return {
      formData,
      formValues,
      fieldInputTypes,
      gameSettingsFields,
      getSections,
      getLabelWithAsterisk,
      getFieldRules,
      gameSettingsInvalid,
      handleGameSettingsUpdate,
      reportForm,
      submitForm
    }
  }
})

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
            color="primary"
            icon="close"
            label="Cancel"
            v-close-popup />
          <q-btn
            v-if="$q.screen.lt.md"
            class="q-ml-md"
            color="primary"
            icon="fab fa-github"
            icon-right="open_in_new"
            label="Submit On GitHub"
            @click="submitForm" />
        </div>
      </div>

      <div v-else class="row items-center no-wrap">
        <div class="col">
          <q-btn
            color="primary"
            icon="close"
            label="Cancel"
            v-close-popup />
        </div>
        <div class="col-auto">
          <q-btn
            v-if="$q.screen.lt.md"
            class="q-ml-md"
            color="primary"
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
                      Organize your options into sections by clicking the
                      <q-btn
                        dense
                        size="xs"
                        :ripple="false"
                        color="primary"
                        class="q-ma-none cursor-inherit">
                        <q-icon left size="3em" name="add_circle" />
                        <div>ADD SECTION</div>
                      </q-btn>
                      “ADD SECTION” button.
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
                        size="xs"
                        :ripple="false"
                        color="primary"
                        class="q-ma-none cursor-inherit">
                        <q-icon left size="3em" name="add_circle" />
                        <div>ADD OPTION</div>
                      </q-btn>
                      “ADD OPTION” button to insert new settings.
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
                        :rules="getFieldRules(field.validations)"
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
                        :rules="getFieldRules(field.validations)"
                      />
                    </template>
                  </div>
                  <div v-else-if="'id' in field && gameSettingsFields.includes(field.id)">
                    <div :style="gameSettingsInvalid && field.validations?.required ? 'border: thin solid red;' : '' ">
                      <GameSettingsFields
                        :fieldData="field"
                        :previousData="previousSubmission?.[field.id] || ''"
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
              color="primary"
              icon="close"
              label="Cancel"
              v-close-popup />-->
      <q-btn
        color="primary"
        icon="fab fa-github"
        icon-right="open_in_new"
        label="Submit On GitHub"
        @click="submitForm" />
    </q-card-actions>
  </q-card>
</template>

<style scoped>
.scroll {
  overflow-y: auto;
}

.in-game-settings-head h2 {
  font-size: inherit;
  font-weight: bold;
  line-height: inherit;
  font-size: 1.75rem;
}

.in-game-settings-head p {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

</style>
