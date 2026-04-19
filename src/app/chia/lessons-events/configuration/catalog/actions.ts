'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const CATALOG_PATH = '/chia/lessons-events/configuration/catalog'

export async function updatePricingConfig(key: string, price: number | null): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('pricing_config')
    .update({ default_price: price, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) return { error: error.message }
  revalidatePath(CATALOG_PATH)
  return {}
}

export async function updateEventTypePrice(code: string, price: number | null): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('event_type')
    .update({ default_price: price })
    .eq('code', code)
  if (error) return { error: error.message }
  revalidatePath(CATALOG_PATH)
  return {}
}

export async function toggleEventTypeActive(code: string, active: boolean): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('event_type')
    .update({ is_active: active })
    .eq('code', code)
  if (error) return { error: error.message }
  revalidatePath(CATALOG_PATH)
  return {}
}

export async function addEventType(formData: FormData): Promise<{ error?: string }> {
  const label    = (formData.get('label') as string | null)?.trim()
  const duration = parseInt(formData.get('duration_minutes') as string)
  const price    = formData.get('price') ? parseFloat(formData.get('price') as string) : null
  const badge    = (formData.get('calendar_badge') as string | null)?.trim().toUpperCase().slice(0, 4) || null
  const color    = (formData.get('calendar_color') as string | null)?.trim() || null

  if (!label) return { error: 'Label is required.' }
  if (isNaN(duration) || duration <= 0) return { error: 'Duration must be a positive number.' }
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Color must be a 6-digit hex code (e.g. #e89c3a).' }

  // Derive code from label: lowercase, spaces → underscores, strip non-alphanumeric
  const code = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  if (!code) return { error: 'Could not derive a valid code from the label.' }

  const supabase = createAdminClient()

  // Get highest sort_order to place new type at the end (before 'other')
  const { data: existing } = await supabase
    .from('event_type')
    .select('sort_order, code')
    .order('sort_order', { ascending: false })
    .limit(1)

  const maxOrder = existing?.[0]?.sort_order ?? 80
  const sortOrder = existing?.[0]?.code === 'other' ? maxOrder : maxOrder + 10

  const { error } = await supabase.from('event_type').insert({
    code,
    label,
    default_duration_minutes: duration,
    default_price:            price,
    calendar_badge:           badge,
    calendar_color:           color,
    is_active:                true,
    sort_order:               sortOrder,
  })

  if (error) {
    if (error.code === '23505') return { error: `An event type with code "${code}" already exists.` }
    return { error: error.message }
  }

  revalidatePath(CATALOG_PATH)
  return {}
}
