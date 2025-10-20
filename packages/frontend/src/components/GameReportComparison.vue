<script setup lang="ts">
import { computed } from 'vue'
import type { GameReport, GameReportData } from '../../../shared/src/game'
import { parseMarkdownKeyValueList } from 'src/utils/markdownSettings'

interface ComparisonRow {
  id: string;
  label: string;
  values: string[];
  status: 'same' | 'different';
}

interface SectionConfig {
  id: string;
  title: string;
  rows: ComparisonRow[];
}

interface ReportHeader {
  id: string | number;
  shortTitle: string;
  user: string;
  device: string;
}

type ComparisonReport = Omit<GameReport, 'data'> & {
  data: Partial<GameReportData>;
}

const props = defineProps<{
  reports: ComparisonReport[];
}>()

const reportHeaders = computed<ReportHeader[]>(() =>
  props.reports.map((report, index) => ({
    id: report.id ?? index,
    shortTitle: `Report ${index + 1}`,
    user: report.user?.login ?? '',
    device: report.data?.device ?? '',
  })),
)

const systemRows = computed<ComparisonRow[]>(() =>
  buildFixedRows([
    {
      id: 'undervolt_applied',
      label: 'Undervolt Applied',
      getter: (data: Partial<GameReportData>) => data.undervolt_applied ?? '',
    },
    {
      id: 'compatibility_tool',
      label: 'Compatibility Tool',
      getter: (data: Partial<GameReportData>) =>
        data.steam_play_compatibility_tool_used && data.compatibility_tool_version
          ? `${data.steam_play_compatibility_tool_used}: ${data.compatibility_tool_version}`
          : '',
    },
    {
      id: 'game_resolution',
      label: 'Game Resolution',
      getter: (data: Partial<GameReportData>) => data.game_resolution ?? '',
    },
    {
      id: 'custom_launch_options',
      label: 'Launch Options',
      getter: (data: Partial<GameReportData>) => data.custom_launch_options ?? '',
    },
  ]),
)

const performanceRows = computed<ComparisonRow[]>(() =>
  buildFixedRows([
    {
      id: 'frame_limit',
      label: 'Frame Limit / Refresh Rate',
      getter: (data: Partial<GameReportData>) => {
        if (data.frame_limit == null) return ''
        if (data.disable_frame_limit === 'On') {
          return `Refresh Rate: ${data.frame_limit}Hz`
        }
        return `Frame Limit: ${data.frame_limit}FPS`
      },
    },
    {
      id: 'disable_frame_limit',
      label: 'Disable Frame Limit',
      getter: (data: Partial<GameReportData>) => data.disable_frame_limit ?? '',
    },
    {
      id: 'enable_vrr',
      label: 'Enable VRR',
      getter: (data: Partial<GameReportData>) => data.enable_vrr ?? '',
    },
    {
      id: 'allow_tearing',
      label: 'Allow Tearing',
      getter: (data: Partial<GameReportData>) => data.allow_tearing ?? '',
    },
    {
      id: 'half_rate_shading',
      label: 'Half Rate Shading',
      getter: (data: Partial<GameReportData>) => data.half_rate_shading ?? '',
    },
    {
      id: 'tdp_limit',
      label: 'TDP Limit',
      getter: (data: Partial<GameReportData>) =>
        data.tdp_limit != null ? `${data.tdp_limit}W` : '',
    },
    {
      id: 'manual_gpu_clock',
      label: 'Manual GPU Clock',
      getter: (data: Partial<GameReportData>) =>
        data.manual_gpu_clock != null ? `${data.manual_gpu_clock}MHz` : '',
    },
    {
      id: 'scaling_mode',
      label: 'Scaling Mode',
      getter: (data: Partial<GameReportData>) => data.scaling_mode ?? '',
    },
    {
      id: 'scaling_filter',
      label: 'Scaling Filter',
      getter: (data: Partial<GameReportData>) => data.scaling_filter ?? '',
    },
  ]),
)

const displaySettingRows = computed<ComparisonRow[]>(() =>
  buildMarkdownRows(data => data.game_display_settings),
)

const graphicsSettingRows = computed<ComparisonRow[]>(() =>
  buildMarkdownRows(data => data.game_graphics_settings),
)

const sections = computed<SectionConfig[]>(() => [
  { id: 'system', title: 'System Configuration', rows: systemRows.value },
  { id: 'performance', title: 'Performance Settings', rows: performanceRows.value },
  { id: 'display', title: 'Game Display Settings', rows: displaySettingRows.value },
  { id: 'graphics', title: 'Game Graphics Settings', rows: graphicsSettingRows.value },
].filter(section => section.rows.length > 0))

function buildFixedRows(config: {
  id: string;
  label: string;
  getter: (data: Partial<GameReportData>) => string;
}[]): ComparisonRow[] {
  if (!props.reports?.length) return []
  return config
    .map(({ id, label, getter }) => {
      const values = props.reports.map(report => sanitizeValue(getter(report.data)))
      if (!values.some(value => value)) return null
      return {
        id,
        label,
        values,
        status: determineRowStatus(values),
      }
    })
    .filter((row): row is ComparisonRow => row !== null)
}

function buildMarkdownRows(getter: (data: Partial<GameReportData>) => string | undefined): ComparisonRow[] {
  if (!props.reports?.length) return []
  const parsedPerReport = props.reports.map(report => parseMarkdownKeyValueList(getter(report.data)))
  if (parsedPerReport.every(entries => entries.length === 0)) return []

  const order: string[] = []
  const labelLookup = new Map<string, string>()

  const baseEntries = parsedPerReport[0] ?? []
  baseEntries.forEach(entry => {
    if (!order.includes(entry.key)) order.push(entry.key)
    if (!labelLookup.has(entry.key)) labelLookup.set(entry.key, entry.rawKey)
  })

  parsedPerReport.forEach(entries => {
    entries.forEach(entry => {
      if (!order.includes(entry.key)) order.push(entry.key)
      if (!labelLookup.has(entry.key)) labelLookup.set(entry.key, entry.rawKey)
    })
  })

  return order
    .map(key => {
      const label = labelLookup.get(key) ?? key
      const values = parsedPerReport.map(entries => {
        const match = entries.find(entry => entry.key === key)
        return sanitizeValue(match?.value ?? '')
      })
      if (!values.some(value => value)) return null
      return {
        id: `markdown-${key}`,
        label,
        values,
        status: determineRowStatus(values),
      }
    })
    .filter((row): row is ComparisonRow => row !== null)
}

function sanitizeValue(value: string | null | undefined): string {
  if (!value) return ''
  return String(value).trim()
}

function determineRowStatus(values: string[]): 'same' | 'different' {
  if (!values.length) return 'different'
  const normalized = values.map(value => value.trim()).filter(value => value)
  if (normalized.length === 0) return 'different'
  if (normalized.length !== values.length) return 'different'
  const [first, ...rest] = normalized
  if (!first) return 'different'
  const baseline = first.toLowerCase()
  const allEqual = rest.every(value => value.toLowerCase() === baseline)
  return allEqual ? 'same' : 'different'
}

function getCellClasses(status: 'same' | 'different', value: string) {
  const trimmed = value.trim()
  return {
    'value-cell': true,
    'value-cell--same': status === 'same' && trimmed.length > 0,
    'value-cell--different': status === 'different' && trimmed.length > 0,
    'value-cell--empty': trimmed.length === 0,
  }
}

function displayCellValue(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : '—'
}
</script>

<template>
  <div class="report-comparison">
    <section
      v-for="section in sections"
      :key="section.id"
      class="comparison-section"
    >
      <h3 class="section-title">{{ section.title }}</h3>
      <table class="comparison-table">
        <thead>
        <tr>
          <th class="label-column">Setting</th>
          <th
            v-for="header in reportHeaders"
            :key="header.id"
            class="report-column"
          >
            <div class="report-header">
              <div class="report-name">{{ header.shortTitle }}</div>
              <div v-if="header.user || header.device" class="report-meta">
                <span v-if="header.user">@{{ header.user }}</span>
                <span v-if="header.user && header.device"> • </span>
                <span v-if="header.device">{{ header.device }}</span>
              </div>
            </div>
          </th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="row in section.rows" :key="row.id">
          <th scope="row" class="label-column">{{ row.label }}</th>
          <td
            v-for="(value, index) in row.values"
            :key="`${row.id}-${index}`"
            :class="getCellClasses(row.status, value)"
          >
            {{ displayCellValue(value) }}
          </td>
        </tr>
        </tbody>
      </table>
    </section>
    <div v-if="sections.length === 0" class="empty-state">
      No comparable report data available.
    </div>
  </div>
</template>

<style scoped>
.report-comparison {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.comparison-section {
  background: color-mix(in srgb, var(--q-dark, #1d1d1d) 85%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 16px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 1.15rem;
  font-weight: 600;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.comparison-table th,
.comparison-table td {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px;
  vertical-align: top;
  text-align: left;
}

.comparison-table thead th {
  background: color-mix(in srgb, var(--q-primary, #1976d2) 20%, transparent);
  font-weight: 600;
}

.label-column {
  min-width: 180px;
  width: 180px;
}

.report-column {
  min-width: 180px;
}

.report-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.report-name {
  font-weight: 600;
}

.report-meta {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
}

.value-cell {
  background: color-mix(in srgb, var(--q-dark, #1d1d1d) 80%, transparent);
  transition: background-color 0.2s ease;
}

.value-cell--same {
  background: color-mix(in srgb, var(--q-positive, #21ba45) 35%, transparent);
}

.value-cell--different {
  background: color-mix(in srgb, var(--q-warning, #f2c037) 35%, transparent);
}

.value-cell--empty {
  color: rgba(255, 255, 255, 0.5);
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.95rem;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 6px;
}

@media (max-width: 1023px) {
  .label-column {
    min-width: 150px;
    width: 150px;
  }
}

@media (max-width: 767px) {
  .comparison-section {
    padding: 12px;
  }

  .comparison-table {
    font-size: 0.9rem;
  }

  .label-column {
    min-width: 140px;
    width: 140px;
  }
}
</style>
