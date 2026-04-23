'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { getRiderScope } from '../../_lib/riderScope'
import { revalidatePath } from 'next/cache'

export async function uploadHorseRecord(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser()
  if (!user?.personId) return { error: 'Not signed in.' }

  const horseId = formData.get('horseId')
  const file    = formData.get('file')

  if (typeof horseId !== 'string' || !horseId) return { error: 'Missing horse.' }
  if (!(file instanceof File))                  return { error: 'Missing file.' }
  if (file.type !== 'application/pdf')          return { error: 'Only PDF uploads are supported.' }
  if (file.size > 20 * 1024 * 1024)             return { error: 'File is too large (max 20 MB).' }
  if (file.size === 0)                          return { error: 'File is empty.' }

  const db = createAdminClient()

  // Access check: the person must have this horse in their rider scope, OR be admin.
  if (!user.isAdmin) {
    const riderIds = await getRiderScope(user.personId)
    const { data: connection } = await db
      .from('horse_contact')
      .select('role')
      .eq('horse_id', horseId)
      .in('person_id', riderIds)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (!connection) return { error: 'Not authorized for this horse.' }
  }

  const stamp   = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'upload.pdf'
  const path    = `owner-uploads/${horseId}/${stamp}-${safeName}`
  const buffer  = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await db.storage
    .from('documents')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
  if (upErr) return { error: `Upload failed: ${upErr.message}` }

  const { error: docErr } = await db.from('document').insert({
    horse_id:            horseId,
    person_id:           null,
    document_type:       'Owner Upload',
    filename:            safeName,
    file_url:            path,
    uploaded_at:         new Date().toISOString(),
    uploaded_by:         user.personId,
    submitted_by_owner:  true,
  })
  if (docErr) {
    // Best-effort cleanup of the orphaned storage object.
    await db.storage.from('documents').remove([path])
    return { error: `Could not save upload: ${docErr.message}` }
  }

  revalidatePath(`/my/horses/${horseId}`)
  return { ok: true }
}
