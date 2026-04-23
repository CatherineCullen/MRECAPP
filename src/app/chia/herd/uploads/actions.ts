'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function markUploadReviewed(
  documentId: string,
): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()
  const { error } = await db
    .from('document')
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.personId,
    })
    .eq('id', documentId)
    .eq('submitted_by_owner', true)
    .is('reviewed_at', null)
  if (error) return { error: error.message }

  revalidatePath('/chia/herd/uploads')
  return { ok: true }
}

export async function unmarkUploadReviewed(
  documentId: string,
): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()
  const { error } = await db
    .from('document')
    .update({ reviewed_at: null, reviewed_by: null })
    .eq('id', documentId)
    .eq('submitted_by_owner', true)
  if (error) return { error: error.message }

  revalidatePath('/chia/herd/uploads')
  return { ok: true }
}
