import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { getHeapStatistics, writeHeapSnapshot } from 'node:v8'

const DEFAULT_TELEMETRY_INTERVAL_MS = 30_000
const DEFAULT_SNAPSHOT_THRESHOLD_PERCENT = 70
const DEFAULT_SNAPSHOT_RETAIN_COUNT = 3

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseNonNegativeInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const readCgroupNumber = (paths: string[]): number | null => {
  for (const filePath of paths) {
    try {
      const raw = readFileSync(filePath, 'utf8').trim()
      if (raw === 'max') return null

      const value = Number.parseInt(raw, 10)
      if (Number.isFinite(value) && value > 0 && value < Number.MAX_SAFE_INTEGER) {
        return value
      }
    } catch {
      // Try the next cgroup version/path.
    }
  }
  return null
}

const getCgroupMemory = (): { currentBytes: number | null; limitBytes: number | null } => ({
  currentBytes: readCgroupNumber([
    '/sys/fs/cgroup/memory.current',
    '/sys/fs/cgroup/memory/memory.usage_in_bytes',
  ]),
  limitBytes: readCgroupNumber([
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  ]),
})

const snapshotDirectory = process.env.SSR_HEAP_SNAPSHOT_DIR || '/diagnostics'
const snapshotThresholdPercent = parseNonNegativeInteger(
  process.env.SSR_HEAP_SNAPSHOT_RSS_PERCENT,
  DEFAULT_SNAPSHOT_THRESHOLD_PERCENT,
)
const snapshotRetainCount = parsePositiveInteger(
  process.env.SSR_HEAP_SNAPSHOT_RETAIN_COUNT,
  DEFAULT_SNAPSHOT_RETAIN_COUNT,
)
let snapshotCaptured = false
let snapshotInProgress = false

const pruneOldSnapshots = (): void => {
  try {
    const snapshots = readdirSync(snapshotDirectory)
      .filter((fileName) => fileName.endsWith('.heapsnapshot'))
      .map((fileName) => {
        const filePath = path.join(snapshotDirectory, fileName)
        return { filePath, mtimeMs: statSync(filePath).mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const snapshot of snapshots.slice(snapshotRetainCount)) {
      unlinkSync(snapshot.filePath)
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ssr_heap_snapshot_prune_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

const captureHeapSnapshot = (reason: string): void => {
  if (snapshotInProgress) return
  snapshotInProgress = true

  try {
    mkdirSync(snapshotDirectory, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(
      snapshotDirectory,
      `web-ssr-${timestamp}-${process.pid}.heapsnapshot`,
    )

    console.warn(JSON.stringify({ event: 'ssr_heap_snapshot_started', reason, filePath }))
    writeHeapSnapshot(filePath)
    snapshotCaptured = true
    pruneOldSnapshots()
    console.warn(JSON.stringify({ event: 'ssr_heap_snapshot_completed', reason, filePath }))
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ssr_heap_snapshot_failed',
        reason,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  } finally {
    snapshotInProgress = false
  }
}

const logMemoryTelemetry = (): void => {
  const memory = process.memoryUsage()
  const heap = getHeapStatistics()
  const cgroup = getCgroupMemory()
  const rssLimitPercent = cgroup.limitBytes
    ? Number(((memory.rss / cgroup.limitBytes) * 100).toFixed(2))
    : null

  console.log(
    JSON.stringify({
      event: 'ssr_memory',
      log_type: 'METRIC',
      metric_name: 'ssr_memory',
      metric_timestamp: new Date().toISOString(),
      metric_value: memory.rss,
      source_project: 'deck-verified-web-ssr',
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      heapSizeLimitBytes: heap.heap_size_limit,
      totalAvailableHeapBytes: heap.total_available_size,
      cgroupCurrentBytes: cgroup.currentBytes,
      cgroupLimitBytes: cgroup.limitBytes,
      rssLimitPercent,
    }),
  )

  if (
    snapshotThresholdPercent > 0 &&
    !snapshotCaptured &&
    rssLimitPercent !== null &&
    rssLimitPercent >= snapshotThresholdPercent
  ) {
    captureHeapSnapshot(`rss-limit-${rssLimitPercent}-percent`)
  }
}

export const startSsrMemoryObservability = (): void => {
  const telemetryIntervalMs = parsePositiveInteger(
    process.env.SSR_MEMORY_TELEMETRY_INTERVAL_MS,
    DEFAULT_TELEMETRY_INTERVAL_MS,
  )

  process.on('SIGUSR2', () => captureHeapSnapshot('SIGUSR2'))
  logMemoryTelemetry()
  setInterval(logMemoryTelemetry, telemetryIntervalMs).unref()
}
