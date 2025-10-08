<script setup lang="ts">
import { computed } from 'vue'
import { getItadUrlFromGameSlug } from 'src/utils/external-links'
import { QTooltip } from 'quasar'

/**
 * PriceBadge
 *
 * Props:
 *  - itadSlug: string - optional slug for ITAD link
 *  - priceNew: number - new (discounted) price. If null/undefined, treated as absent.
 *  - priceOld: number - original price (required for display)
 *  - priceCut: number - percent discount (integer like 10 for 10%)
 *
 * Behavior:
 *  - When priceCut > 0 and priceNew is provided: show discount box on the left (green),
 *    original price (strike-through) above the discounted price in larger font.
 *  - If no discount (priceCut falsy): show a single compact chip with the price.
 */

const props = defineProps<{
  itadSlug?: string | null
  priceNew?: number | null
  priceOld?: number | null
  priceCut?: number | null
}>()

/* Helpers / computed values */
const hasDiscount = computed(() => {
  return Boolean(props.priceCut && props.priceCut > 0 && typeof props.priceNew === 'number')
})

const itadLink = computed(() => {
  return props.itadSlug ? getItadUrlFromGameSlug(props.itadSlug) : 'https://isthereanydeal.com/'
})

const formatCurrency = (n?: number | null) => {
  // Try a safe fallback to locale-aware numeric formatting and prefix with USD symbol
  try {
    return `$${(n as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } catch {
    return `$${(n as number).toFixed(2)}`
  }
}

const formattedNewCurrency = computed(() => formatCurrency(props.priceNew))
const formattedOldCurrency = computed(() => formatCurrency(props.priceOld))

const formattedDiscount = computed(() => {
  const cut = props.priceCut ?? 0
  if (!cut || cut === 0) return ''
  // Prepend sign like '-10%'
  return (cut > 0 ? `-${cut}%` : `${cut}%`)
})
</script>

<template>
  <div class="price-badge">
    <a
      :href="itadLink"
      target="_blank"
      rel="noopener noreferrer"
      class="price-badge-link"
      aria-label="View price on IsThereAnyDeal"
    >
      <!-- Container using flexbox so children can stretch to full height -->
      <div class="price-badge-content">

        <!-- Discount + Price side-by-side when discount exists -->
        <template v-if="hasDiscount">
          <div class="discount-box">
            <q-avatar size="20px" class="q-mr-xs">
              <q-img src="~/assets/icons/itad-icon.svg" class="q-ma-xs" />
            </q-avatar>
            <span class="discount-text">{{ formattedDiscount }}</span>
          </div>

          <div class="price-box">
            <div class="price-inner column q-gutter-none">
              <span class="price-old">{{ formattedOldCurrency }}</span>
              <span class="price-new">{{ formattedNewCurrency }}</span>
            </div>
          </div>
        </template>

        <!-- Single compact chip when no discount -->
        <template v-else>
          <div class="price-box single">
            <q-avatar size="20px" class="q-mr-xs">
              <q-img src="~/assets/icons/itad-icon.svg" class="q-ma-xs" />
            </q-avatar>
            <div class="price-inner">
              <span class="price-new">{{ formattedOldCurrency || formattedNewCurrency }}</span>
            </div>
          </div>
        </template>

        <q-tooltip>IsThereAnyDeal: Best price {{ formattedNewCurrency }}</q-tooltip>

      </div>
    </a>
  </div>
</template>

<style scoped>
/* Root */
.price-badge {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.price-badge-link {
  text-decoration: none;
  color: inherit;
  display: inline-block;
}

.price-badge-content {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 40px;
  border-radius: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.discount-box,
.price-box {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  box-sizing: border-box;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  border-radius: 0;
}

/* Discount (left) — green */
.discount-box {
  background-color: #59bf40;
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
  text-align: center;
}

/* Price (right) — darker */
.price-box {
  background-color: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  text-align: center;
}

/* If only a single chip (no discount), make it size to content rather than split */
.price-box.single {
  flex: 0 0 auto;
  padding: 0 10px;
  height: 100%;
}

.price-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.price-old {
  text-decoration: line-through;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1;
}

.price-new {
  font-size: 1rem;
  color: #ffffff;
  font-weight: 700;
  line-height: 1;
}

@media (max-width: 360px) {
  .discount-box {
    flex: 0 0 auto;
    padding: 0 8px;
  }

  .price-box {
    flex: 1 1 0;
    padding: 0 8px;
  }
}
</style>