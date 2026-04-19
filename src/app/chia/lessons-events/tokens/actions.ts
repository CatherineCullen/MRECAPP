'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// Both the list view and the detail view can fire these actions. Revalidate
// both paths so whichever the admin is on refreshes correctly.
function revalidateTokenViews(tokenId: string) {
  revalidatePath('/chia/lessons-events/tokens')
  revalidatePath(`/chia/lessons-events/tokens/${tokenId}`)
}

export async function expireToken(tokenId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('makeup_token')
    .update({
      status:            'expired',
      status_changed_at: new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .eq('id', tokenId)
    .eq('status', 'available')   // never expire a used/scheduled token

  if (error) return { error: error.message }
  revalidateTokenViews(tokenId)
  return {}
}

export async function restoreToken(tokenId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('makeup_token')
    .update({
      status:            'available',
      status_changed_at: new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .eq('id', tokenId)
    .eq('status', 'expired')

  if (error) return { error: error.message }
  revalidateTokenViews(tokenId)
  return {}
}

export async function updateTokenNote(tokenId: string, note: string | null): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('makeup_token')
    .update({
      notes:      note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenId)

  if (error) return { error: error.message }
  revalidateTokenViews(tokenId)
  return {}
}

/**
 * Batch-expire every Available token whose official_expires_at is in the past,
 * optionally scoped to a single quarter. Admin can skip this and expire
 * individually — this is just a time-saver at quarter end.
 */
export async function batchExpirePastDue(quarterId?: string): Promise<{ count: number; error?: string }> {
  const supabase = createAdminClient()
  const today    = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('makeup_token')
    .update({
      status:            'expired',
      status_changed_at: new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .eq('status', 'available')
    .lt('official_expires_at', today)

  if (quarterId) query = query.eq('quarter_id', quarterId)

  const { data, error } = await query.select('id')
  if (error) return { count: 0, error: error.message }

  revalidatePath('/chia/lessons-events/tokens')
  return { count: data?.length ?? 0 }
}

type GrantArgs = {
  riderId:        string
  subscriptionId: string | null
  quarterId:      string
  note:           string
}

/**
 * Admin-grant a token. No source lesson required — this is for goodwill,
 * instructor illness not formally logged, edge cases, etc.
 */
export async function grantToken(args: GrantArgs): Promise<{ error?: string; tokenId?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  // Get the quarter's end_date for official_expires_at
  const { data: q, error: qErr } = await supabase
    .from('quarter')
    .select('end_date')
    .eq('id', args.quarterId)
    .single()

  if (qErr || !q) return { error: qErr?.message ?? 'Quarter not found.' }

  const { data, error } = await supabase
    .from('makeup_token')
    .insert({
      rider_id:            args.riderId,
      subscription_id:     args.subscriptionId,
      original_lesson_id:  null,
      reason:              'admin_grant',
      grant_reason:        args.note.trim() || null,
      quarter_id:          args.quarterId,
      official_expires_at: q.end_date,
      status:              'available',
      created_by:          user?.personId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to create token.' }

  revalidatePath('/chia/lessons-events/tokens')
  return { tokenId: data.id }
}
