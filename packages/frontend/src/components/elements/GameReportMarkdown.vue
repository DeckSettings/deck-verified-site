<script lang="ts">
import { defineComponent, ref } from 'vue'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
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
    const youTubeVideoId = ref('')

    function extractYouTubeId(url: string): string | null {
      const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\n?#]+)/
      const match = url.match(regex)
      return match && match[1] !== undefined ? match[1] : null
    }

    // Create a custom renderer for marked
    const renderer = new marked.Renderer()

    // Override the default link behavior. Use this to extract custom link data for handling outside of marked
    const defaultLinkRenderer = renderer.link
    renderer.link = function(link: Tokens.Link): string {
      const { href, title, tokens } = link
      // Extract the text content from tokens
      const text = tokens?.reduce((acc, token) => acc + ('text' in token ? token.text : ''), '') || ''
      // If any token has raw content with "shields.io", return default link rendering
      if (
        tokens.some((token: Token) =>
          (token.raw && token.raw.includes('shields.io')) ||
          (token.type === 'image' && token.href && token.href.includes('shields.io'))
        )
      ) {
        return defaultLinkRenderer.call(this, link)
      }
      // Check if the URL is a YouTube link
      if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(href)) {
        const videoId = extractYouTubeId(href)
        if (videoId) {
          youTubeVideoId.value = videoId
          return ''
        }
      }
      // Fallback for regular links
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr}>${text}</a>`
    }

    const parsedMarkdown = marked(props.markdown, { renderer })
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
      sanitisedParsedMarkdown,
      youTubeVideoId
    }
  }
})

</script>

<template>
  <div>
    <div v-html="sanitisedParsedMarkdown" class="report-markdown q-ml-md-sm"></div>
    <iframe v-if="youTubeVideoId"
            style="width: 100%; max-width: 800px; aspect-ratio: 16 / 9;"
            :src="`https://www.youtube.com/embed/${youTubeVideoId}`" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
      Loading embedded YT player for link https://youtu.be/{{ youTubeVideoId }}
    </iframe>
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
