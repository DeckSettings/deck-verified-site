<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { gameReportTemplate } from 'src/services/gh-reports'
import type { GameReportForm, GitHubIssueTemplateBody } from '../../../shared/src/game'
import ReportFormMarkdown from 'components/elements/ReportFormMarkdown.vue'


export default defineComponent({
  components: { ReportFormMarkdown },
  props: {
    gameName: {
      type: String,
      required: true
    }
  },
  setup() {
    const formData = ref<GameReportForm | null>(null)
    const formValues = ref<Record<string, string | number | null>>({})

    const initFormData = async () => {
      const data = await gameReportTemplate()
      formData.value = data

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
        })
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

    const getLabelWithAsterisk = (label: string, required: boolean | undefined): string => {
      return required ? `${label} *` : label
    }

    const getFieldRules = (validations: { required?: boolean } | undefined, hint: string) => {
      const rules: Array<(value: string | number | null) => true | string> = []

      if (validations?.required) {
        rules.push((value) => !!value || `REQUIRED: ${hint}`)
      }

      return rules
    }

    const submitForm = () => {
      console.log('Form submitted with data:', formValues.value)
      // Add logic to handle form submission, e.g., API call
    }

    onMounted(async () => {
      await initFormData()
    })

    return {
      formData,
      formValues,
      getSections,
      getLabelWithAsterisk,
      getFieldRules,
      submitForm
    }
  }
})

</script>

<template>
  <q-card style="width: 1200px; max-width: 90vw;">
    <q-card-section>
      <div class="text-h6">{{ gameName }}</div>
    </q-card-section>

    <q-separator />

    <q-card-section style="max-height: 90vh; overflow-y: auto;" class="scroll">
      <q-spinner v-if="!formData" />
      <div v-else>
        <div v-for="(section, index) in getSections()" :key="index">
          <div class="row">
            <div class="col-4">
              <ReportFormMarkdown :markdown="section.markdown" />
            </div>
            <div class="col-8">
              <div v-for="(field, index) in section.fields" :key="index" class="q-mb-md">
                  <!-- Render input fields -->
                  <q-input
                    v-if="field.type === 'input'"
                    outlined
                    v-model="formValues[field.id]"
                    :label="getLabelWithAsterisk(field.attributes.label, field.validations?.required)"
                    :hint="field.attributes.description || ''"
                    :rules="getFieldRules(field.validations, field.attributes.description)"
                  />
                  <!-- Render dropdown fields -->
                  <q-select
                    v-else-if="field.type === 'dropdown'"
                    outlined
                    v-model="formValues[field.id]"
                    :label="getLabelWithAsterisk(field.attributes.label, field.validations?.required)"
                    :options="field.attributes.options || []"
                    emit-value
                    map-options
                  />
                  <!-- Render textarea fields -->
                  <q-input
                    v-else-if="field.type === 'textarea'"
                    outlined
                    type="textarea"
                    v-model="formValues[field.id]"
                    :label="getLabelWithAsterisk(field.attributes.label, field.validations?.required)"
                    :hint="field.attributes.description || ''"
                  />
                  <!-- Render unsupported fields warning -->
                  <q-banner v-else type="warning">
                    Unsupported field type: {{ field.type }}
                  </q-banner>
                </div>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <q-btn flat label="Cancel" color="primary" v-close-popup />
      <q-btn flat label="Submit" color="primary" @click="submitForm" />
    </q-card-actions>
  </q-card>
</template>

<style scoped>
.scroll {
  overflow-y: auto;
}
</style>
