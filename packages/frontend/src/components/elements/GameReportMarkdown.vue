<script lang="ts">
import { defineComponent, ref } from 'vue'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import createDOMPurify from 'dompurify'

export default defineComponent({
  methods: { marked },
  props: {
    markdown: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const youTubeVideoId = ref('')
    const additionalImages = ref<{ src: string; alt?: string }[]>([])

    function extractYouTubeId(url: string): string | null {
      const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\n?#]+)/
      const match = url.match(regex)
      return match && match[1] !== undefined ? match[1] : null
    }

    // Create a custom renderer for marked
    const renderer = new marked.Renderer()

    // Override the default link behaviour. Use this to extract custom link data for handling outside marked
    const defaultLinkRenderer = renderer.link
    renderer.link = function(link: Tokens.Link): string {
      const { href, title, tokens } = link
      // Extract the text content from tokens
      const text = tokens?.reduce((acc, token) => acc + ('text' in token ? token.text : ''), '') || ''
      // If any token has raw content with "shields.io", return default link rendering
      if (
        tokens.some((token: Token) =>
          (token.raw && token.raw.includes('shields.io')) ||
          (token.type === 'image' && token.href && token.href.includes('shields.io')),
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

    const defaultImageRenderer = renderer.image

    const isWhitelistedAttachment = (src: string) => {
      return (
        src.startsWith('https://github.com/user-attachments/') ||
        src.startsWith('https://assets.deckverified.games/')
      )
    }

    // Override if we are provided with an image
    renderer.image = function(image: Tokens.Image): string {
      const { href: src, text: alt = '' } = image
      if (typeof src === 'string') {
        if (isWhitelistedAttachment(src)) {
          // Capture approved attachments to render below the markdown block
          additionalImages.value.push({ src, alt })
          return ''
        }
        if (src.startsWith('https://img.shields.io/')) {
          return defaultImageRenderer.call(this, image)
        }
      }
      // Empty/Drop the string
      return ''
    }

    // Override <img> HTML tags before sanitization
    renderer.html = function(token: Tokens.HTML): string {
      const html = token.text
      // Find img tags
      const imgMatch = html.match(
        /<img\s+[^>]*src="([^"]+)"(?:\s+alt="([^"]*)")?[^>]*\/?>/i,
      )
      if (imgMatch) {
        const [, src = '', alt = ''] = imgMatch
        // Collect whitelisted attachment domains for out-of-band rendering
        if (isWhitelistedAttachment(src)) {
          additionalImages.value.push({ src, alt })
        }
      }
      // drop all raw HTML - We never need to allow this
      return ''
    }

    const parsedMarkdown = marked(props.markdown, { renderer, breaks: true })

    // SSR-safe sanitize: only use DOMPurify in the browser
    let sanitisedParsedMarkdown = String(parsedMarkdown)
    if (typeof window !== 'undefined') {
      const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
      sanitisedParsedMarkdown = DOMPurify.sanitize(String(parsedMarkdown), {
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
          'ul',
          'li',
          'ol',
          'h4',
          'h5',
          'h6',
          'img',
        ],
        ALLOWED_ATTR: ['class', 'src', 'href', 'alt'],
      })
    }

    return {
      parsedMarkdown,
      sanitisedParsedMarkdown,
      youTubeVideoId,
      additionalImages,
    }
  },
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
    <div v-if="additionalImages.length" style="margin-top: 1rem;">
      <img
        v-for="(img, i) in additionalImages"
        :key="i"
        :src="img.src"
        :alt="img.alt || ''"
        style="display: block; max-width: 100%; height: auto; margin: 1rem auto;"
      />
    </div>
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

::v-deep(.report-markdown a) {
  color: var(--q-secondary);
  text-decoration-color: color-mix(in srgb, var(--q-secondary) 20%, transparent);
}

::v-deep(.report-markdown a:hover) {
  text-decoration: underline;
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
