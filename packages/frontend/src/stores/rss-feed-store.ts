import { acceptHMRUpdate, defineStore } from 'pinia'
import { apiUrl, fetchService } from 'src/utils/api'

export interface FeedItem {
  title: string
  link: string
  description: string
  author: string | null
  pubDate: string | null
  ogImage: string | null
  ogImageStatus: OgImageStatus
}

export interface FeedDefinition {
  title: string
  subtitle: string
  url: string
  logo: string | null
  items: FeedItem[]
  lastFetched: number | null
  isLoading: boolean
  error: string | null
  hasLoadedOnce: boolean
}

export type OgImageStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface FeedStoreState {
  feeds: Record<string, FeedDefinition>
}

const ONE_HOUR = 60 * 60 * 1000
const MAX_ITEMS_PER_FEED = 12
const INITIAL_OG_STATUS: OgImageStatus = 'idle'

const OG_IMAGE_CACHE_KEY = 'dv:ogImageCache:v1'

const loadOgImageCache = (): Record<string, string> => {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(OG_IMAGE_CACHE_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch (e) {
    console.warn('[rss-feed] Failed to load OG image cache', e)
    return {}
  }
}

const saveOgImageCache = (cache: Record<string, string>) => {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
    localStorage.setItem(OG_IMAGE_CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.warn('[rss-feed] Failed to save OG image cache', e)
  }
}

const getCachedOgImage = (link: string): string | null => {
  try {
    const cache = loadOgImageCache()
    return cache[link] ?? null
  } catch {
    return null
  }
}

const setCachedOgImage = (link: string, url: string) => {
  try {
    const cache = loadOgImageCache()
    cache[link] = url
    saveOgImageCache(cache)
  } catch {
    // Ignore
  }
}

const normaliseWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim()

const encodeBase64 = (value: string): string => {
  type BufferLike = {
    from(input: string, encoding: string): { toString(encoding: string): string }
  }
  const bufferCtor: BufferLike | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as typeof globalThis & { Buffer?: BufferLike }).Buffer
    : undefined

  if (bufferCtor) {
    return bufferCtor.from(value, 'utf-8').toString('base64')
  }

  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
  }

  throw new Error('Base64 encoding is not supported in this environment')
}

const buildProxiedFeedUrl = (feedUrl: string): string => {
  const encoded = encodeBase64(feedUrl)
  return apiUrl(`/deck-verified/api/v1/rss?feed=${encodeURIComponent(encoded)}`)
}

const safeQuerySelector = (element: ParentNode | null, selector: string) => {
  if (!element) return null
  if (selector.includes(':')) {
    const escaped = selector.replace(/:/g, '\\:')
    return element.querySelector(escaped)
  }
  return element.querySelector(selector)
}

const getTextContent = (element: Element | null, selectors: string[]): string | null => {
  if (!element) return null
  for (const selector of selectors) {
    const node = safeQuerySelector(element, selector)
    const value = node?.textContent?.trim()
    if (value) return value
  }
  return null
}

const toPlainText = (html: string, parser: DOMParser): string => {
  const doc = parser.parseFromString(html, 'text/html')
  const text = doc.body?.textContent
  return text ? normaliseWhitespace(text) : normaliseWhitespace(html)
}

const parseFeedXml = (xml: string, feedUrl: string): FeedDefinition => {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is not available in this environment')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid RSS feed received')
  }

  const channel = doc.querySelector('channel')
  if (!channel) {
    throw new Error('Missing channel element in RSS feed')
  }

  const title = getTextContent(channel, ['title']) ?? 'Untitled feed'
  const subtitleRaw = getTextContent(channel, ['description']) ?? ''
  const subtitle = subtitleRaw ? normaliseWhitespace(subtitleRaw) : ''
  const logoValue = getTextContent(channel, ['image > url'])
  let logoUrl: string | null = null
  if (logoValue) {
    try {
      logoUrl = new URL(logoValue, feedUrl).href
    } catch (error) {
      console.warn('[rss-feed] Unable to resolve feed logo URL', error)
      logoUrl = logoValue
    }
  }

  const items = Array.from(channel.getElementsByTagName('item'))
    .map((item) => {
      const itemTitle = getTextContent(item, ['title']) ?? 'Untitled entry'
      const link = getTextContent(item, ['link']) ?? feedUrl

      const rawDescription = getTextContent(item, ['content:encoded', 'description']) ?? ''
      const description = rawDescription ? toPlainText(rawDescription, parser) : ''

      const author = getTextContent(item, ['dc:creator', 'author'])
      const pubDate = getTextContent(item, ['pubDate'])

      return {
        title: itemTitle,
        link,
        description,
        author: author ?? null,
        pubDate: pubDate ?? null,
        ogImage: null,
        ogImageStatus: INITIAL_OG_STATUS,
      }
    })
    .filter((item) => Boolean(item.title) && Boolean(item.link))
    .slice(0, MAX_ITEMS_PER_FEED)

  return {
    title,
    subtitle,
    url: feedUrl,
    logo: logoUrl,
    items,
    lastFetched: Date.now(),
    isLoading: false,
    error: null,
    hasLoadedOnce: true,
  }
}

interface FeedDefaults {
  title?: string
  subtitle?: string
  logo?: string | null
}

export const useRssFeedStore = defineStore('rss-feed', {
  state: (): FeedStoreState => ({
    feeds: {},
  }),

  getters: {
    feedList: (state) => Object.values(state.feeds),
    feedByKey: (state) => (key: string) => state.feeds[key],
    lastUpdated: (state) => {
      const timestamps = Object.values(state.feeds)
        .map((feed) => feed.lastFetched)
        .filter((value): value is number => typeof value === 'number')

      if (timestamps.length === 0) {
        return null
      }

      return Math.max(...timestamps)
    },
  },

  actions: {
    registerFeed(key: string, url: string, defaults?: FeedDefaults) {
      if (!this.feeds[key]) {
        this.feeds[key] = {
          title: defaults?.title ?? 'Loading…',
          subtitle: defaults?.subtitle ?? '',
          url,
          logo: defaults?.logo ?? null,
          items: [],
          lastFetched: null,
          isLoading: false,
          error: null,
          hasLoadedOnce: false,
        }
      } else {
        const feed = this.feeds[key]
        if (defaults?.title) feed.title = defaults.title
        if (defaults?.subtitle) feed.subtitle = defaults.subtitle
        if (defaults?.logo !== undefined) feed.logo = defaults.logo
      }
    },

    async ensureFeed(key: string, force = false) {
      const feed = this.feeds[key]
      if (!feed) {
        console.warn(`[rss-feed] Feed ${key} is not registered`)
        return
      }

      const now = Date.now()
      const shouldUseCache =
        !force && feed.lastFetched && now - feed.lastFetched < ONE_HOUR && feed.items.length > 0

      if (shouldUseCache) {
        return
      }

      feed.isLoading = true
      feed.error = null

      try {
        const proxiedUrl = buildProxiedFeedUrl(feed.url)
        const response = await fetchService(proxiedUrl, {
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml',
          },
        })

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const xml = await response.text()
        const parsedFeed = parseFeedXml(xml, feed.url)
        if (!feed.title || feed.title === 'Loading…') {
          feed.title = parsedFeed.title
        }
        if (!feed.subtitle) {
          feed.subtitle = parsedFeed.subtitle
        }
        if (!feed.logo && parsedFeed.logo) {
          feed.logo = parsedFeed.logo
        }
        feed.items = parsedFeed.items
        feed.lastFetched = parsedFeed.lastFetched
        feed.isLoading = false
        feed.error = null
        feed.hasLoadedOnce = true
      } catch (error) {
        console.error(`[rss-feed] Failed to load feed ${key}`, error)
        const message = error instanceof Error ? error.message : 'Unable to load feed content'
        feed.error = message
        if (!feed.items.length) {
          feed.lastFetched = null
        }
      } finally {
        feed.isLoading = false
      }
    },

    async ensureOgImage(key: string, link: string) {
      const feed = this.feeds[key]
      if (!feed) return

      const item = feed.items.find((entry) => entry.link === link)
      if (!item) return

      if (item.ogImageStatus === 'loading' || item.ogImageStatus === 'loaded') {
        return
      }

      try {
        const cached = getCachedOgImage(link)
        if (cached) {
          item.ogImage = cached
          item.ogImageStatus = 'loaded'
          return
        }
      } catch {
        // Ignore and continue
      }

      if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        item.ogImageStatus = 'error'
        return
      }

      item.ogImageStatus = 'loading'

      try {
        const response = await fetchService(link, {
          headers: {
            Accept: 'text/html,application/xhtml+xml',
          },
        })

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const html = await response.text()
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        let resolved: string | null = null

        try {
          // Handle ITAD extraction
          const isItad = /(?:https?:\/\/)?(?:www\.)?isthereanydeal\.com/i.test(link)
          if (isItad) {
            // look for the cover image used in their page markup; be slightly permissive with selector
            const itadImg = doc.querySelector('img.cover, img[class*="cover"]') as HTMLImageElement | null
            const itadSrc = itadImg?.getAttribute('src')?.trim()
            if (itadSrc) {
              try {
                resolved = new URL(itadSrc, link).href
              } catch {
                resolved = itadSrc
              }
            }
          }
        } catch {
          // Ignore
        }

        // Fall back to standard OG meta if we didn't get a site-specific image
        if (!resolved) {
          const meta = doc.querySelector('meta[property="og:image"], meta[name="og:image"]')
          const content = meta?.getAttribute('content')?.trim()
          if (content && content.length > 0) {
            try {
              resolved = new URL(content, link).href
            } catch (urlError) {
              console.warn('[rss-feed] Unable to resolve OG image URL, using raw value', urlError)
              resolved = content
            }
          }
        }

        item.ogImage = resolved
        item.ogImageStatus = 'loaded'

        if (resolved) {
          try {
            setCachedOgImage(link, resolved)
          } catch {
            // Ignore
          }
        }
      } catch (error) {
        console.error(`[rss-feed] Failed to fetch OG image for ${link}`, error)
        item.ogImageStatus = 'error'
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useRssFeedStore, import.meta.hot))
}
