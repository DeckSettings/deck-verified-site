<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type { GameReport, GameReportData } from '../../../shared/src/game'
import { parseMarkdownKeyValueList } from 'src/utils/markdownSettings'
import PrimaryButton from 'components/elements/PrimaryButton.vue'
import { useGameStore } from 'src/stores/game-store'
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
  index: number;
}

interface ReportHeader {
  id: string | number;
  shortTitle: string;
  user: string;
  device: string;
  summary: string;
  targetFramerate: string;
  batteryLife: string;
  hasTargetFramerate: boolean;
  hasBatteryLife: boolean;
}

interface ComparisonTableRow {
  id: string;
  setting: string;
  values: string[];
  status: 'same' | 'different';
  sectionIndex: number;
}

type ComparisonReport = Omit<GameReport, 'data'> & {
  data: Partial<GameReportData>;
}

type ComparisonColumn = QTableColumn & {
  headerInfo?: ReportHeader;
  index?: number;
}

type SectionHeaderRow = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionIndex: number;
  type: 'section-header';
};

type ComparisonDisplayRow =
  | (ComparisonTableRow & {
  sectionId: string;
  sectionTitle: string;
  sectionIndex: number;
  type: 'data';
})
  | SectionHeaderRow;

const props = defineProps<{
  reports: ComparisonReport[];
}>()

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'close'): void;
}>()

const gameStore = useGameStore()

const reportHeaders = computed<ReportHeader[]>(() =>
  props.reports.map((report, index) => {
    const summary = formatSummary(report.data?.summary)
    const targetMetrics = formatTargetFramerate(report.data?.target_framerate)
    const batteryMetrics = formatBatteryLife(report.data?.calculated_battery_life_minutes)

    return {
      id: report.id ?? index,
      shortTitle: `Report ${index + 1}`,
      user: report.user?.login ?? '',
      device: report.data?.device ?? '',
      summary,
      targetFramerate: targetMetrics.text,
      hasTargetFramerate: targetMetrics.hasValue,
      batteryLife: batteryMetrics.text,
      hasBatteryLife: batteryMetrics.hasValue,
    }
  }),
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
  .map((section, index) => ({
    ...section,
    index,
    tableRows: section.rows.map(row => ({
      id: row.id,
      setting: row.label,
      values: row.values,
      status: row.status,
      sectionIndex: index,
    })),
  })))

const selectedCount = computed(() => props.reports.length)

const headerTitle = computed(() => {
  const candidates = [
    gameStore.gameName,
    props.reports[0]?.data?.game_name,
  ]
  for (const candidate of candidates) {
    const sanitized = sanitizeValue(candidate)
    if (sanitized) return sanitized
  }
  return 'Compare Reports'
})

const headerSubtitle = computed(() => {
  if (selectedCount.value === 0) return 'No reports selected'
  return `Compare ${selectedCount.value} report${selectedCount.value === 1 ? '' : 's'}`
})

const headerImageSrc = computed(() => {
  const sources = [
    gameStore.gameBanner,
    gameStore.gamePoster,
    gameStore.metadata.image,
  ]
  for (const src of sources) {
    const sanitized = sanitizeValue(src)
    if (sanitized) return sanitized
  }
  return ''
})

const hasHeaderImage = computed(() => headerImageSrc.value.length > 0)

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
      field: (row: ComparisonTableRow | ComparisonDisplayRow) => {
        if ('values' in row && Array.isArray(row.values)) {
          return row.values[index] ?? ''
        }
        return ''
      },
      align: 'left',
      sortable: false,
      headerInfo: header,
      index,
    }),
  )
  return [baseColumn, ...dynamicColumns]
})

const comparisonTableRows = computed<ComparisonDisplayRow[]>(() =>
  sections.value.flatMap(section => [
    {
      id: `${section.id}__header`,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionIndex: section.index,
      type: 'section-header' as const,
    },
    ...section.tableRows.map(row => ({
      ...row,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionIndex: section.index,
      type: 'data' as const,
    })),
  ]),
)

const currentSectionTitle = ref('Setting')
const currentSectionIndex = ref(0)
const tableWrapperRef = ref<HTMLElement | null>(null)
const tableScrollContainer = ref<HTMLElement | null>(null)
const sectionHeaderElements = ref<HTMLElement[]>([])
const STICKY_TOP_OFFSET = 16

const currentSectionColor = computed(() => getSectionColor(currentSectionIndex.value))

const handleTableScroll = () => {
  updateCurrentSectionFromScroll()
}

function updateTableScrollContainer() {
  const wrapper = tableWrapperRef.value
  const nextContainer = wrapper?.querySelector('.q-table__middle') as HTMLElement | null
  if (tableScrollContainer.value === nextContainer) return
  if (tableScrollContainer.value) {
    tableScrollContainer.value.removeEventListener('scroll', handleTableScroll)
  }
  tableScrollContainer.value = nextContainer
  if (tableScrollContainer.value) {
    tableScrollContainer.value.addEventListener('scroll', handleTableScroll, { passive: true })
  }
}

function collectSectionHeaderElements() {
  const container = tableScrollContainer.value
  if (!container) {
    sectionHeaderElements.value = []
    return
  }
  sectionHeaderElements.value = Array.from(
    container.querySelectorAll<HTMLElement>('[data-section-header]'),
  )
}

function updateCurrentSectionFromScroll() {
  const container = tableScrollContainer.value
  const headers = sectionHeaderElements.value

  if (!container || headers.length === 0) {
    currentSectionTitle.value = sections.value[0]?.title ?? 'Setting'
    currentSectionIndex.value = sections.value[0]?.index ?? 0
    return
  }

  const containerTop = container.getBoundingClientRect().top
  let activeHeader = headers[0]

  headers.forEach(header => {
    const headerTop = header.getBoundingClientRect().top
    if (headerTop - containerTop <= STICKY_TOP_OFFSET) {
      activeHeader = header
    }
  })

  currentSectionTitle.value =
    activeHeader?.dataset.sectionTitle ?? sections.value[0]?.title ?? 'Setting'
  const sectionIndexValue = activeHeader?.dataset.sectionIndex
  currentSectionIndex.value = sectionIndexValue != null ? Number(sectionIndexValue) || 0 : 0
}

async function refreshSectionTracking() {
  await nextTick()
  updateTableScrollContainer()
  if (!sections.value.length) {
    sectionHeaderElements.value = []
    currentSectionTitle.value = 'Setting'
    currentSectionIndex.value = 0
    return
  }
  collectSectionHeaderElements()
  updateCurrentSectionFromScroll()
}

onMounted(() => {
  void refreshSectionTracking()
})

watch(
  () => sections.value
    .map(section => `${section.id}:${section.tableRows.length}:${section.tableRows.map(row => row.id).join(',')}`)
    .join('|'),
  () => {
    void refreshSectionTracking()
  },
)

onBeforeUnmount(() => {
  if (tableScrollContainer.value) {
    tableScrollContainer.value.removeEventListener('scroll', handleTableScroll)
  }
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

function formatSummary(value: string | null | undefined): string {
  const sanitized = sanitizeValue(value)
  if (!sanitized) return ''
  return sanitized.replace(/\s+/g, ' ')
}

function formatTargetFramerate(value: string | null | undefined): { text: string; hasValue: boolean } {
  const normalized = sanitizeValue(value)
  const hasValue = normalized.length > 0
  let display = normalized

  if (hasValue && /^\d+$/.test(normalized)) {
    display = `${normalized} FPS`
  }

  return {
    text: hasValue ? display : '—',
    hasValue,
  }
}

function formatBatteryLife(minutes: number | null | undefined): { text: string; hasValue: boolean } {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) {
    return { text: '—', hasValue: false }
  }

  const totalMinutes = Math.max(0, Math.round(minutes))
  if (totalMinutes <= 0) {
    return { text: '—', hasValue: false }
  }

  const hours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60
  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (remainingMinutes > 0 || parts.length === 0) {
    parts.push(`${remainingMinutes}m`)
  }

  return {
    text: parts.join(' '),
    hasValue: true,
  }
}

function getDisplayRowValue(row: ComparisonDisplayRow, column: ComparisonColumn | QTableColumn): string {
  if (row.type !== 'data') return ''
  if (column.name === 'setting') return row.setting
  const typedColumn = column as ComparisonColumn
  if (typedColumn.index == null) return ''
  return row.values[typedColumn.index] ?? ''
}

function getHeaderStickyStyle(isLabelColumn: boolean) {
  return {
    position: 'sticky',
    top: 'var(--comparison-sticky-header-offset, 0px)',
    zIndex: isLabelColumn ? 5 : 3,
    transition: 'background-color 0.25s ease-in',
  }
}

const SECTION_COLOR_WEIGHTS = [30, 70] as const
const DEFAULT_SECTION_COLOR_WEIGHT = SECTION_COLOR_WEIGHTS[0]

function getSectionColorWeight(index: number): number {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_SECTION_COLOR_WEIGHT
  }
  const length = SECTION_COLOR_WEIGHTS.length
  const safeIndex = ((index % length) + length) % length
  const weight = SECTION_COLOR_WEIGHTS[safeIndex]
  return weight ?? DEFAULT_SECTION_COLOR_WEIGHT
}

function getSectionColor(index: number): string {
  const weight = getSectionColorWeight(index)
  return `color-mix(in srgb, var(--q-primary, #1976d2) ${weight}%, var(--q-dark))`
}

function getSectionSoftColor(index: number): string {
  const weight = Math.max(getSectionColorWeight(index) - 15, 20)
  return `color-mix(in srgb, var(--q-primary, #1976d2) ${weight}%, var(--q-dark))`
}

function getSectionStyle(index: number) {
  return {
    '--section-row-color': getSectionColor(index),
    '--section-row-color-soft': getSectionSoftColor(index),
  }
}
</script>

<template>
  <q-card class="comparison-card">
    <q-card-section class="comparison-card__header">
      <div class="header-content">
        <div class="header-info">
          <q-img
            v-if="hasHeaderImage"
            class="header-image"
            :src="headerImageSrc"
            alt="Game Banner"
            fit="contain"
          >
            <template #error>
              <img src="~/assets/banner-placeholder.png" alt="Placeholder" />
            </template>
          </q-img>
          <div class="header-details">
            <div class="header-title">{{ headerTitle }}</div>
            <div class="header-subtitle">{{ headerSubtitle }}</div>
          </div>
        </div>
        <div class="header-actions header-actions--comparison">
          <div class="header-action header-action--cancel" v-if="selectedCount">
            <PrimaryButton
              class="header-btn"
              label="Clear"
              color="warning"
              icon="clear_all"
              full-width
              :dense="$q.screen.lt.sm"
              @click="() => { emit('clear'); emit('close') }"
            />
          </div>
          <div class="header-action header-action--cancel">
            <PrimaryButton
              class="header-btn"
              label="Close"
              color="negative"
              icon="close"
              full-width
              :dense="$q.screen.lt.sm"
              @click="emit('close')"
            />
          </div>
        </div>
      </div>
    </q-card-section>
    <q-separator />
    <q-card-section class="comparison-card__body">
      <div
        ref="tableWrapperRef"
        class="comparison-table-container"
      >
        <q-table
          flat
          dense
          hide-bottom
          :rows="comparisonTableRows"
          :columns="columns"
          row-key="id"
          separator="cell"
          class="comparison-qtable full-height"
          table-class="comparison-qtable__table"
          :rows-per-page-options="[0]"
          :pagination="{ rowsPerPage: 0 }"
          :style="{
            '--comparison-section-color': currentSectionColor,
          }"
        >
          <template #header-cell="slotCtx">
            <q-th
              :props="slotCtx"
              :class="[
                'sticky-header',
                slotCtx.col.name === 'setting' ? 'sticky-left label-column' : 'report-column',
              ]"
              :style="getHeaderStickyStyle(slotCtx.col.name === 'setting')"
            >
              <template v-if="slotCtx.col.name === 'setting'">
                <div class="section-title">
                  {{ currentSectionTitle || 'Setting' }}
                </div>
              </template>
              <template v-else>
                <div class="report-header">
                  <div class="report-name">
                    {{ slotCtx.col.headerInfo?.shortTitle ?? slotCtx.col.label }}
                  </div>
                  <div
                    v-if="slotCtx.col.headerInfo?.user || slotCtx.col.headerInfo?.device"
                    class="report-meta report-meta--details ellipsis"
                  >
                    <span v-if="slotCtx.col.headerInfo?.user">
                      @{{ slotCtx.col.headerInfo?.user }}
                    </span>
                    <span
                      v-if="slotCtx.col.headerInfo?.user && slotCtx.col.headerInfo?.device"
                      class="report-meta__separator"
                      aria-hidden="true"
                    >
                      •
                    </span>
                    <span v-if="slotCtx.col.headerInfo?.device">
                      {{ slotCtx.col.headerInfo?.device }}
                    </span>
                  </div>
                  <div
                    v-if="slotCtx.col.headerInfo?.summary"
                    class="report-meta report-summary ellipsis"
                    :title="slotCtx.col.headerInfo?.summary"
                  >
                    "{{ slotCtx.col.headerInfo?.summary }}"
                  </div>
                  <div
                    v-if="slotCtx.col.headerInfo && (slotCtx.col.headerInfo.hasTargetFramerate || slotCtx.col.headerInfo.hasBatteryLife)"
                    class="report-meta report-metrics"
                  >
                    <span
                      v-if="slotCtx.col.headerInfo?.hasTargetFramerate"
                      class="report-metrics__value"
                      :title="slotCtx.col.headerInfo?.targetFramerate"
                    >
                      {{ slotCtx.col.headerInfo?.targetFramerate }}
                    </span>
                    <span
                      v-if="slotCtx.col.headerInfo?.hasTargetFramerate && slotCtx.col.headerInfo?.hasBatteryLife"
                      class="report-metrics__separator"
                      aria-hidden="true"
                    >
                      •
                    </span>
                    <span
                      v-if="slotCtx.col.headerInfo?.hasBatteryLife"
                      class="report-metrics__value"
                      :title="slotCtx.col.headerInfo?.batteryLife"
                    >
                      {{ slotCtx.col.headerInfo?.batteryLife }}
                    </span>
                  </div>
                </div>
              </template>
            </q-th>
          </template>
          <template #body="slotCtx">
            <q-tr
              v-if="slotCtx.row.type === 'section-header'"
              :key="`section-header-${slotCtx.row.sectionId}`"
              :class="['section-header-row', `section-${slotCtx.row.sectionId}`]"
              :data-section-header="slotCtx.row.sectionId"
              :data-section-title="`${slotCtx.row.sectionTitle}`"
              :data-section-index="slotCtx.row.sectionIndex"
              :style="getSectionStyle(slotCtx.row.sectionIndex)"
            >
              <q-td
                :colspan="slotCtx.cols.length"
                class="section-header-cell"
                :style="getSectionStyle(slotCtx.row.sectionIndex)"
              >
                {{ slotCtx.row.sectionTitle }}
              </q-td>
            </q-tr>
            <q-tr
              v-else
              :key="`section-rows-${slotCtx.row.sectionId}`"
              :props="slotCtx"
              :class="['comparison-row', `section-${slotCtx.row.sectionId}`]"
              :data-section-row="slotCtx.row.sectionId"
            >
              <template
                v-for="col in slotCtx.cols"
                :key="col.name"
              >
                <q-td
                  :props="slotCtx"
                  :class="col.name === 'setting'
                    ? ['label-column', 'sticky-left', 'value-cell']
                    : getCellClasses(slotCtx.row.status, getDisplayRowValue(slotCtx.row, col))"
                  :style="col.name === 'setting' ? getSectionStyle(slotCtx.row.sectionIndex) : undefined"
                >
                  <template v-if="col.name === 'setting'">
                    {{ slotCtx.row.setting }}
                  </template>
                  <template v-else>
                    {{ displayCellValue(getDisplayRowValue(slotCtx.row, col)) }}
                  </template>
                </q-td>
              </template>
            </q-tr>
          </template>
          <template #no-data>
            <div class="empty-state">
              No comparable report data available.
            </div>
          </template>
        </q-table>
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
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-grow: 1;
  min-width: 0;
}

.header-image {
  height: 60px;
  width: auto;
  max-width: 320px;
  aspect-ratio: 16 / 7;
  border-radius: 10px;
  overflow: hidden;
}

.header-image :deep(img) {
  object-fit: contain;
  height: 100%;
  width: auto;
}

.header-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.header-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  margin-top: 4px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: stretch;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.header-actions--comparison {
  min-width: 0;
}

.header-action {
  flex: 0 1 200px;
  min-width: 150px;
  display: flex;
}

.header-action--cancel {
  flex: 0 1 200px;
  min-width: 150px;
}

.header-btn {
  width: 100%;
  margin: 0 !important;
}

.comparison-card__body {
  flex: 1 1 auto;
  padding: 0;
  overflow: hidden;
  display: flex;
  --comparison-sticky-header-offset: 0px;
}

.comparison-table-container {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 16px;
  padding: 20px 24px 24px;
  overflow: hidden;
}

.comparison-qtable {
  flex: 1 1 auto;
  max-width: 100%;
}

.comparison-qtable.full-height {
  height: 100%;
}

.comparison-qtable__table {
  min-width: 900px;
}

.comparison-qtable :deep(.q-table__container) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--q-dark, #1d1d1d) 85%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
}

.comparison-qtable :deep(.q-table__middle) {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: auto;
}

.comparison-qtable :deep(thead th),
.comparison-qtable :deep(tbody td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px;
  vertical-align: top;
  text-align: left;
  max-width: 300px;
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
}

.comparison-qtable :deep(thead th) {
  background-color: var(--comparison-section-color, color-mix(in srgb, var(--q-primary, #1976d2) 60%, var(--q-dark)));
  font-weight: 600;
  transition: background-color 0.25s ease-in;
  max-width: 300px;
  width: 300px;
  box-sizing: border-box;
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

.comparison-qtable :deep(.sticky-header) {
  position: sticky;
  top: var(--comparison-sticky-header-offset, 0px);
  z-index: 3;
}

.comparison-qtable :deep(.sticky-header.sticky-left) {
  z-index: 5;
}

.comparison-qtable :deep(tbody) {
  scroll-margin-top: 48px;
}

.section-header-row {
  position: relative;
}

.section-title,
.section-header-cell {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 12px 0;
  color: #fff;
}

.section-header-cell {
  background-color: var(--section-row-color, color-mix(in srgb, var(--q-primary, #1976d2) 55%, var(--q-dark, #1d1d1d)));
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  transition: background-color 0.25s ease-in;
}

.report-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 300px;
}

.report-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.report-meta {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  line-height: 1.3;
}

.report-meta--details {
  display: flex;
  align-items: center;
  gap: 6px;
}

.report-meta__separator {
  opacity: 0.6;
}

.report-summary {
  font-style: italic;
  max-width: 100%;
  color: rgba(255, 255, 255, 0.78);
}

.report-metrics {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.report-metrics__value {
  white-space: nowrap;
}

.report-metrics__separator {
  opacity: 0.6;
}

.value-cell {
  background: color-mix(in srgb, var(--q-dark, #1d1d1d) 98%, transparent);
  transition: background-color 0.2s ease;
}

.comparison-qtable :deep(tbody td.label-column) {
  background-color: var(--section-row-color-soft, color-mix(in srgb, var(--q-primary, #1976d2) 40%, var(--q-dark, #1d1d1d)));
  transition: background-color 0.25s ease-in;
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

  .comparison-table-container {
    padding: 16px;
  }

  .label-column {
    min-width: 150px;
    width: 150px;
  }
}

@media (max-width: 767px) {
  .comparison-table-container {
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

  .comparison-table-container {
    padding: 0 3px 0 3px;
  }

  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .header-info {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-image {
    display: none;
  }

  .header-actions--comparison {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }

  .header-action {
    flex: 1 1 150px;
    min-width: 120px;
  }

  .report-header {
    max-width: 170px;
  }

  .report-meta--details {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .report-meta--details .report-meta__separator {
    display: none;
  }

  .report-meta__separator {
    display: none;
  }

  .sticky-left {
    position: static !important;
    left: auto !important;
    top: auto !important;
    z-index: auto !important;
  }

  .comparison-qtable :deep(thead) {
    position: sticky !important;
    top: 0;
    z-index: 4;
  }

  .comparison-qtable :deep(.sticky-header.sticky-left) {
    position: static !important;
    left: auto !important;
    top: auto !important;
    z-index: auto !important;
  }

  .comparison-qtable :deep(thead th .section-title) {
    position: static;
  }

  .comparison-qtable :deep(thead th) {
    max-width: 170px;
    width: 170px;
    padding: 8px;
  }

  .comparison-qtable :deep(thead th:first-child) {
    padding: 5px;
  }

  .comparison-qtable :deep(thead td) {
    padding: 8px;
  }

  .comparison-qtable :deep(thead td:first-child) {
    padding: 5px;
  }

  .comparison-card .header-content {
    align-items: stretch;
  }

}
</style>
