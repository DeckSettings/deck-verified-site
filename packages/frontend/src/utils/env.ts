const FALLBACK_BACKEND_ORIGIN = 'https://deckverified.games'

function normalizeOrigin(origin: string | undefined | null): string | undefined {
  if (!origin) return undefined
  const trimmed = origin.trim()
  if (!trimmed) return undefined
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const envRecord = import.meta.env as Record<string, string | undefined>
const fromImportMeta = normalizeOrigin(envRecord.BACKEND_API_ORIGIN ?? envRecord.VITE_BACKEND_API_ORIGIN)
const fromProcess = typeof process !== 'undefined' ? normalizeOrigin(process.env?.BACKEND_API_ORIGIN) : undefined
const fromGlobal = typeof globalThis !== 'undefined'
  ? normalizeOrigin((globalThis as Record<string, unknown>).BACKEND_API_ORIGIN as string | undefined)
  : undefined

export const BACKEND_API_ORIGIN =
  fromImportMeta ??
  fromProcess ??
  fromGlobal ??
  FALLBACK_BACKEND_ORIGIN
