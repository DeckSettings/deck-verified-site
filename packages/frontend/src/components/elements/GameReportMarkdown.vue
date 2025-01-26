<script lang="ts">
import { defineComponent } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

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
    const sanitisedParsedMarkdown = DOMPurify.sanitize(String(parsedMarkdown), {
      ALLOWED_TAGS: [
        'div',
        'span',
        'code',
        'p',
        'strong',
        'del',
        'em',
        'sup',
        'mark',
        'b',
        'br',
        'hr',
        'a',
        'img',
        'ul',
        'li',
        'ol',
        'h4',
        'h5',
        'h6'
      ],
      ALLOWED_ATTR: ['class', 'src', 'href', 'alt']
    })

    return {
      parsedMarkdown,
      sanitisedParsedMarkdown
    }
  }
})

</script>

<template>
  <div>
    <div v-html="sanitisedParsedMarkdown" class="report-markdown q-ml-md-sm"></div>
  </div>
</template>

<style scoped>
/* Custom formatting for markdown headers */
::v-deep(.report-markdown h1),
::v-deep(.report-markdown h2),
::v-deep(.report-markdown h3),
::v-deep(.report-markdown h4),
::v-deep(.report-markdown h5),
::v-deep(.report-markdown h6) {
  font-size: inherit;
  font-weight: bold;
  line-height: inherit;
}

::v-deep(.report-markdown h1) {
  font-size: 2rem;
}

::v-deep(.report-markdown h2) {
  font-size: 1.75rem;
}

::v-deep(.report-markdown h3) {
  font-size: 1.25rem;
}

::v-deep(.report-markdown h4) {
  font-size: 1rem;
}

::v-deep(.report-markdown h5) {
  font-size: 0.9rem;
}

::v-deep(.report-markdown h6) {
  font-size: 0.8rem;
}

::v-deep(.report-markdown p) {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

/* Highlighting for code blocks */
::v-deep(.report-markdown code) {
  background-color: #f5f5f5;
  color: #333;
  font-family: "Courier New", Courier, monospace;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.95em;
}

/* Multi-line code blocks */
::v-deep(.report-markdown pre) {
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
::v-deep(.report-markdown pre code) {
  background: none; /* Prevent additional background */
  color: inherit; /* Use the color of pre */
  padding: 0;
}

/* Custom formatting for markdown lists */
::v-deep(.report-markdown ul) {
  list-style: none;
  padding: 0;
}

::v-deep(.report-markdown ul li) {
  padding: 12px 5px;
  display: flex;
  justify-content: space-between;
  text-align: right;
}

::v-deep(.report-markdown ul li strong) {
  display: block;
  text-align: left;
  margin-right: 5px;
  min-width: 60px;
}

::v-deep(.report-markdown ul li:not(:last-child)) {
  border-bottom: 1px solid #ddd;
}

/* -sm- */
@media (min-width: 600px) {
  ::v-deep(.report-markdown ul li) {
    padding: 12px 16px;
  }
}
</style>
