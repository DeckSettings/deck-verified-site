<script lang="ts">
import { defineComponent } from 'vue'
import { marked } from 'marked'


export default defineComponent({
  methods: { marked },
  props: {
    markdown: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const parsedMarkdown = marked(props.markdown)
    return {
      parsedMarkdown
    }
  }
})

</script>

<template>
  <div>
    <div v-html="parsedMarkdown" class="form-markdown q-ml-md-sm" />
  </div>
</template>

<style scoped>
/* Custom formatting for markdown headers */
::v-deep(.form-markdown h1),
::v-deep(.form-markdown h2),
::v-deep(.form-markdown h3),
::v-deep(.form-markdown h4),
::v-deep(.form-markdown h5),
::v-deep(.form-markdown h6) {
  font-size: inherit;
  font-weight: bold;
  line-height: inherit;
}

::v-deep(.form-markdown h1) {
  font-size: 2rem;
}

::v-deep(.form-markdown h2) {
  font-size: 1.75rem;
}

::v-deep(.form-markdown h3) {
  font-size: 1.25rem;
}

::v-deep(.form-markdown h4) {
  font-size: 1rem;
}

::v-deep(.form-markdown h5) {
  font-size: 0.9rem;
}

::v-deep(.form-markdown h6) {
  font-size: 0.8rem;
}

::v-deep(.form-markdown p) {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

/* Highlighting for code blocks */
::v-deep(.form-markdown code) {
  background-color: #f5f5f5;
  color: #333;
  font-family: "Courier New", Courier, monospace;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.95em;
}

/* Multi-line code blocks */
::v-deep(.form-markdown pre) {
  background-color: #272822;
  color: #f8f8f2;
  font-family: "Courier New", Courier, monospace;
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.9em;
  margin: 1em 0;
  white-space: pre-wrap; /* Allows wrapping for long lines */
  word-break: break-word;
}

/* Code block inside pre */
::v-deep(.form-markdown pre code) {
  background: none; /* Prevent additional background */
  color: inherit; /* Use the color of pre */
  padding: 0;
}
</style>
