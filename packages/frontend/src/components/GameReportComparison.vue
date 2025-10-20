<script setup lang="ts">
import { computed } from 'vue'
import type { GameReport, GameReportData } from '../../../shared/src/game'
import { parseMarkdownKeyValueList } from 'src/utils/markdownSettings'
import SecondaryButton from 'components/elements/SecondaryButton.vue'
import type { QTableColumn } from 'quasar'

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
  tableRows: ComparisonTableRow[];
}

interface ReportHeader {
  id: string | number;
  shortTitle: string;
  user: string;
  device: string;
}

interface ComparisonTableRow {
  id: string;
  setting: string;
  values: string[];
  status: 'same' | 'different';
}

type ComparisonReport = Omit<GameReport, 'data'> & {
  data: Partial<GameReportData>;
}

type ComparisonColumn = QTableColumn & {
  headerInfo?: ReportHeader;
  index?: number;
}

const props = defineProps<{
  reports: ComparisonReport[];
}>()

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'close'): void;
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
].filter(section => section.rows.length > 0)
  .map(section => ({
    ...section,
    tableRows: section.rows.map(row => ({
      id: row.id,
      setting: row.label,
      values: row.values,
      status: row.status,
    })),
  })))

const selectedCount = computed(() => props.reports.length)

const headerSubtitle = computed(() => {
  if (selectedCount.value === 0) return 'No reports selected'
  if (selectedCount.value === 1) return '1 report selected'
  return `${selectedCount.value} reports selected`
})

const columns = computed<ComparisonColumn[]>(() => {
  const baseColumn: ComparisonColumn = {
    name: 'setting',
    label: 'Setting',
    field: 'setting',
    align: 'left',
    sortable: false,
  }
  const dynamicColumns: ComparisonColumn[] = reportHeaders.value.map(
    (header, index) => ({
      name: `report-${index}`,
      label: header.shortTitle,
      field: (row: ComparisonTableRow) => row.values[index] ?? '',
      align: 'left',
      sortable: false,
      headerInfo: header,
      index,
    }),
  )
  return [baseColumn, ...dynamicColumns]
})

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
  <q-card class="comparison-card">
    <q-card-section class="comparison-card__header">
      <div class="header-content">
        <div class="header-titles">
          <div class="header-title">Compare Reports</div>
          <div class="header-subtitle">{{ headerSubtitle }}</div>
        </div>
        <div class="header-actions">
          <SecondaryButton
            v-if="selectedCount"
            size="sm"
            outline
            icon="clear_all"
            label="Clear"
            @click="emit('clear')"
          />
          <q-btn
            flat
            round
            dense
            icon="close"
            class="header-close-btn"
            aria-label="Close comparison dialog"
            @click="emit('close')"
          />
        </div>
      </div>
    </q-card-section>
    <q-separator />
    <q-card-section class="comparison-card__body">
      <div class="report-comparison">
        <section
          v-for="section in sections"
          :key="section.id"
          class="comparison-section"
        >
          <h3 class="section-title">{{ section.title }}</h3>
          <q-table
            flat
            dense
            hide-bottom
            :rows="section.tableRows"
            :columns="columns"
            row-key="id"
            separator="cell"
            class="comparison-qtable"
            table-class="comparison-qtable__table"
            :rows-per-page-options="[0]"
            :pagination="{ rowsPerPage: 0 }"
          >
            <template #header-cell="slotCtx">
              <q-th
                :props="slotCtx"
                :class="[
                  'sticky-header',
                  slotCtx.col.name === 'setting' ? 'sticky-left label-column' : 'report-column',
                ]"
              >
                <template v-if="slotCtx.col.name === 'setting'">
                  Setting
                </template>
                <template v-else>
                  <div class="report-header">
                    <div class="report-name">{{ slotCtx.col.headerInfo?.shortTitle ?? slotCtx.col.label }}</div>
                    <div v-if="slotCtx.col.headerInfo?.user || slotCtx.col.headerInfo?.device"
                         class="report-meta">
                      <span v-if="slotCtx.col.headerInfo?.user">@{{ slotCtx.col.headerInfo?.user }}</span>
                      <span
                        v-if="slotCtx.col.headerInfo?.user && slotCtx.col.headerInfo?.device"
                      > • </span>
                      <span v-if="slotCtx.col.headerInfo?.device">{{ slotCtx.col.headerInfo?.device
                        }}</span>
                    </div>
                  </div>
                </template>
              </q-th>
            </template>
            <template #body-cell="slotCtx">
              <q-td
                :props="slotCtx"
                :class="slotCtx.col.name === 'setting'
                  ? ['label-column', 'sticky-left', 'value-cell']
                  : getCellClasses(slotCtx.row.status, String(slotCtx.value ?? ''))"
              >
                <template v-if="slotCtx.col.name === 'setting'">
                  {{ slotCtx.row.setting }}
                </template>
                <template v-else>
                  {{ displayCellValue(String(slotCtx.value ?? '')) }}
                </template>
              </q-td>
            </template>
            <template #no-data>
              <div class="empty-state">
                No comparable report data available.
              </div>
            </template>
          </q-table>
        </section>
        <div v-if="sections.length === 0" class="empty-state">
          No comparable report data available.
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.comparison-card {
  width: 100%;
  max-width: clamp(680px, calc(100vw - 48px), 2400px);
  height: 92vh;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--q-dark) 95%, transparent);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: 3px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  z-index: 1000;
}

.comparison-card__header {
  flex-shrink: 0;
  background: color-mix(in srgb, var(--q-dark, #1d1d1d) 92%, transparent);
  padding: 20px 24px;
}

.header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
}

.header-subtitle {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.6);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-close-btn {
  color: rgba(255, 255, 255, 0.7);
  transition: color 0.2s ease, background-color 0.2s ease;
}

.header-close-btn:hover,
.header-close-btn:focus-visible {
  color: white;
  background-color: color-mix(in srgb, var(--q-primary, #1976d2) 22%, transparent);
}

.comparison-card__body {
  flex: 1 1 auto;
  padding: 0;
  overflow-y: auto;
}

.report-comparison {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 24px 24px;
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

.comparison-qtable {
  margin-top: 12px;
  max-width: 100%;
  overflow-x: auto;
}

.comparison-qtable__table {
  min-width: 900px;
}

.comparison-qtable :deep(thead th),
.comparison-qtable :deep(tbody td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px;
  vertical-align: top;
  text-align: left;
}

.comparison-qtable :deep(thead th) {
  background: color-mix(in srgb, var(--q-primary, #1976d2) 60%, var(--q-dark));
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 3;
}

.label-column {
  min-width: 180px;
  width: 180px;
}

.report-column {
  min-width: 180px;
}

.sticky-left {
  position: sticky;
  left: 0;
  z-index: 4;
}

.comparison-qtable :deep(thead th.sticky-left) {
  z-index: 5;
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
  background: color-mix(in srgb, var(--q-dark, #1d1d1d) 98%, transparent);
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
  .comparison-card {
    width: calc(100vw - 32px);
    min-width: 0;
  }

  .label-column {
    min-width: 150px;
    width: 150px;
  }
}

@media (max-width: 767px) {
  .comparison-section {
    padding: 12px;
  }

  .comparison-qtable__table {
    font-size: 0.9rem;
  }

  .label-column {
    min-width: 140px;
    width: 140px;
  }
}

@media (max-width: 599px) {
  .comparison-card {
    width: calc(100vw - 16px);
    min-width: 0;
    max-height: 92vh;
    border-radius: 0;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .report-comparison {
    padding: 16px;
  }
}
</style>
