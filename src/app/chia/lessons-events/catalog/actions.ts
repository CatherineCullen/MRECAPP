'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updatePricingConfig(key: string, price: number | null): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('pricing_config')
    .update({ default_price: price, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) return { error: error.message }
  revalidatePath('/chia/lessons-events/catalog')
  return {}
}

export async function updateEventTypePrice(code: string, price: number | null): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('event_type')
    .update({ default_price: price })
    .eq('code', code)
  if (error) return { error: error.message }
  revalidatePath('/chia/lessons-events/catalog')
  return {}
}
