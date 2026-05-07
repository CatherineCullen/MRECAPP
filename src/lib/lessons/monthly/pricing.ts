import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Per-lesson pricing lookups for the monthly model (ADR-0019).
 *
 * Reads from the `pricing_config` table's `subscription_monthly` section
 * (seeded in 20260507000002_per_lesson_pricing.sql). Two rows: one
 * Standard, one Boarder. Per-rider grandfathering is explicitly not
 * supported — these are the only knobs (per ADR-0019).
 */

type DB = SupabaseClient<Database>

/** subscription_type values matching the lesson_subscription column. */
export type SubscriptionType = 'standard' | 'boarder'

/**
 * Catalog key for each subscription type. Keep in sync with the seed
 * rows in 20260507000002_per_lesson_pricing.sql.
 */
const PRICING_KEYS: Record<SubscriptionType, string> = {
  standard: 'subscription_monthly_standard',
  boarder:  'subscription_monthly_boarder',
}

/**
 * Read the configured per-lesson rate for a subscription type.
 *
 * Returns null when the rate has not been set in the catalog yet —
 * caller must handle this (typically by surfacing "set per-lesson rate
 * in Configuration > Catalog before creating subscriptions"). We don't
 * substitute a default; defaulting silently is exactly the kind of
 * surprise that bites at billing time.
 */
export async function getPerLessonPrice(
  db: DB,
  subscriptionType: SubscriptionType,
): Promise<number | null> {
  const key = PRICING_KEYS[subscriptionType]
  const { data, error } = await db
    .from('pricing_config')
    .select('default_price')
    .eq('key', key)
    .single()

  if (error || !data) {
    throw new Error(`pricing_config row missing for key '${key}': ${error?.message ?? 'no row'}`)
  }
  return data.default_price
}

/**
 * Read both per-lesson rates in one query — useful for catalog UIs that
 * show both side by side.
 */
export async function getAllPerLessonPrices(
  db: DB,
): Promise<{ standard: number | null; boarder: number | null }> {
  const { data, error } = await db
    .from('pricing_config')
    .select('key, default_price')
    .eq('section', 'subscription_monthly')

  if (error) {
    throw new Error(`Failed to load per-lesson pricing: ${error.message}`)
  }

  const byKey = new Map((data ?? []).map((r) => [r.key, r.default_price]))
  return {
    standard: byKey.get(PRICING_KEYS.standard) ?? null,
    boarder:  byKey.get(PRICING_KEYS.boarder)  ?? null,
  }
}
