import { gsap } from 'gsap'
export type ScrollTriggerInstance = {
  readonly isActive: boolean
  readonly progress: number
  kill: () => void
  refresh: (safe?: boolean) => void
}

export type ScrollTriggerPlugin = {
  refresh: (safe?: boolean) => void
  create: (vars: Record<string, unknown>) => ScrollTriggerInstance
}

type LoaderOptions = {
  withCSS?: boolean
}

let scrollTriggerPromise: Promise<ScrollTriggerPlugin | null> | null = null
let scrollTriggerInstance: ScrollTriggerPlugin | null = null
let cssPluginRegistered = false

function resolveScrollTrigger(module: unknown): ScrollTriggerPlugin {
  if (!module || typeof module !== 'object') {
    throw new Error('Unable to load ScrollTrigger module')
  }

  const candidate = (module as { default?: ScrollTriggerPlugin; ScrollTrigger?: ScrollTriggerPlugin }).default
    ?? (module as { ScrollTrigger?: ScrollTriggerPlugin }).ScrollTrigger

  if (!candidate) {
    throw new Error('ScrollTrigger plugin is not available in the loaded module')
  }

  return candidate
}

export async function useScrollTrigger(options: LoaderOptions = {}): Promise<ScrollTriggerPlugin | null> {
  if (import.meta.env.SSR) {
    return null
  }

  if (!scrollTriggerPromise) {
    scrollTriggerPromise = import('gsap/ScrollTrigger')
      .then((module) => {
        const plugin = resolveScrollTrigger(module)
        scrollTriggerInstance = plugin
        gsap.registerPlugin(plugin)
        return plugin
      })
      .catch((error) => {
        scrollTriggerPromise = null
        throw error
      })
  }

  const plugin = await scrollTriggerPromise

  if (options.withCSS && !cssPluginRegistered) {
    const { CSSPlugin } = await import('gsap/CSSPlugin')
    gsap.registerPlugin(CSSPlugin)
    cssPluginRegistered = true
  }

  return plugin
}

export async function refreshScrollTrigger(): Promise<void> {
  if (import.meta.env.SSR) {
    return
  }

  const plugin = await useScrollTrigger()
  plugin?.refresh()
}

export function getLoadedScrollTrigger(): ScrollTriggerPlugin | null {
  return scrollTriggerInstance
}
