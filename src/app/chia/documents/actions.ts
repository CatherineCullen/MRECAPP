'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { DOCUMENT_TYPES, isProtectedFromDelete, type DocumentType } from './_lib/documentTypes'

/**
 * Create a document row after the client has already uploaded the file to
 * the `documents` storage bucket. We mirror the Coggins/Vet import pattern:
 * client does the upload (so progress + failure surface at the UI), then
 * the server persists the metadata row.
 *
 * Per documents.md:
 *   - person_id OR horse_id must be set (or both — Lease Agreement historically
 *     attached to both; in v1 Lease files as "Other" per Catherine's call).
 *   - signed_at and expires_at are optional except for Coggins which uses
 *     its own table for expiry (document.expires_at stays null for Coggins).
 */
export async function createDocument(args: {
  type:        DocumentType | string
  filename:    string
  storagePath: string
  personId?:   string | null
  horseId?:    string | null
  signedAt?:   string | null
  expiresAt?:  string | null
  notes?:      string | null
  uploadedAt?: string            // optional override — admin may backdate
}): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  if (!DOCUMENT_TYPES.includes(args.type as DocumentType)) {
    // Tolerate unknown types (free-text legacy) rather than error — the
    // dropdown shouldn't let this happen, but we don't want to lose the upload
    // if someone called the action with a slightly different string.
  }

  const attachedToPerson = !!args.personId
  const attachedToHorse  = !!args.horseId
  if (!attachedToPerson && !attachedToHorse) {
    return { error: 'Must attach the document to a person or a horse.' }
  }

  const db = createAdminClient()

  const { data, error } = await db
    .from('document')
    .insert({
      document_type: args.type,
      filename:      args.filename,
      file_url:      args.storagePath,
      person_id:     args.personId ?? null,
      horse_id:      args.horseId ?? null,
      signed_at:     args.signedAt ?? null,
      expires_at:    args.expiresAt ?? null,
      notes:         args.notes ?? null,
      uploaded_at:   args.uploadedAt ?? new Date().toISOString(),
      uploaded_by:   user.personId ?? null,
      created_by:    user.personId ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to save document.' }

  revalidatePath('/chia/documents')
  if (args.horseId)  revalidatePath(`/chia/herd/horses/${args.horseId}`)
  if (args.personId) revalidatePath(`/chia/people/${args.personId}`)

  return { id: data.id }
}

/**
 * Soft-delete a document. Refuses Waivers outright: has_signed_waiver is
 * derived from a non-deleted Waiver row existing, so soft-deleting one
 * would silently flip the compliance signal. If the admin genuinely needs
 * to replace a waiver, they upload a new one and leave the old record.
 */
export async function softDeleteDocument(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()

  const { data: doc, error: readErr } = await db
    .from('document')
    .select('id, document_type, horse_id, person_id, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (readErr)       return { error: readErr.message }
  if (!doc)          return { error: 'Document not found.' }
  if (doc.deleted_at) return { error: 'Already deleted.' }

  if (isProtectedFromDelete(doc.document_type)) {
    return {
      error:
        'Waivers cannot be deleted — the rider would show as missing a waiver. ' +
        'Upload a replacement alongside the existing record instead.',
    }
  }

  const { error } = await db
    .from('document')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/chia/documents')
  if (doc.horse_id)  revalidatePath(`/chia/herd/horses/${doc.horse_id}`)
  if (doc.person_id) revalidatePath(`/chia/people/${doc.person_id}`)
  return {}
}

/** Edit metadata — filename, notes, signed/expires dates. Not the file itself
 *  (to replace the file, delete + re-upload). Waivers can have notes edited
 *  but the document_type is frozen once set. */
export async function updateDocumentMeta(args: {
  id:         string
  notes?:     string | null
  signedAt?:  string | null
  expiresAt?: string | null
}): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }

  const db = createAdminClient()

  const { data: doc } = await db
    .from('document')
    .select('horse_id, person_id')
    .eq('id', args.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!doc) return { error: 'Document not found.' }

  const { error } = await db
    .from('document')
    .update({
      notes:      args.notes ?? null,
      signed_at:  args.signedAt ?? null,
      expires_at: args.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.id)

  if (error) return { error: error.message }

  revalidatePath('/chia/documents')
  if (doc.horse_id)  revalidatePath(`/chia/herd/horses/${doc.horse_id}`)
  if (doc.person_id) revalidatePath(`/chia/people/${doc.person_id}`)
  return {}
}
