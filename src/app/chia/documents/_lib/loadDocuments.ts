import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { displayName } from '@/lib/displayName'

/**
 * Load documents for the top-level /chia/documents list. Filters come from
 * the URL (type, search). Soft-deleted rows are hidden in every case —
 * the only path for a deleted doc to resurface would be a dedicated
 * "archive" view, which we haven't built.
 *
 * We keep the loader lean and paginate-ready: no implicit join-fetches
 * into child entities (horse diet, person subscription, etc.) — just
 * identity fields for the attach-to label.
 */

export type DocumentListRow = {
  id:            string
  type:          string
  filename:      string
  attachedLabel: string              // "Horse: Babe" / "Person: Jane Doe" / "—"
  attachedKind:  'horse' | 'person' | null
  horseId:       string | null
  personId:      string | null
  signedAt:      string | null       // ISO date
  expiresAt:     string | null       // ISO date
  uploadedAt:    string
  notes:         string | null
}

export type DocumentFilters = {
  type?:   string
  search?: string
}

export async function loadDocuments(filters: DocumentFilters = {}): Promise<DocumentListRow[]> {
  const db = createAdminClient()

  let query = db
    .from('document')
    .select(`
      id, document_type, filename, person_id, horse_id,
      signed_at, expires_at, uploaded_at, notes,
      person:person!document_person_id_fkey ( id, first_name, last_name, preferred_name, is_organization, organization_name ),
      horse:horse ( id, barn_name )
    `)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  if (filters.type && filters.type !== 'all') {
    query = query.eq('document_type', filters.type)
  }
  if (filters.search && filters.search.trim()) {
    // Filename-level search is the main hit; notes are secondary. Supabase's
    // .or() takes a single string with PostgREST syntax.
    const s = filters.search.trim().replace(/[%,]/g, '')
    query = query.or(`filename.ilike.%${s}%,notes.ilike.%${s}%`)
  }

  const { data } = await query

  return (data ?? []).map((row): DocumentListRow => {
    const horse = row.horse as { id: string; barn_name: string | null } | null
    const person = row.person as Parameters<typeof displayName>[0]

    let attachedKind: 'horse' | 'person' | null = null
    let attachedLabel = '—'
    if (horse?.id) {
      attachedKind = 'horse'
      attachedLabel = `Horse: ${horse.barn_name ?? 'Unnamed'}`
    } else if (person) {
      attachedKind = 'person'
      attachedLabel = `Person: ${displayName(person)}`
    }

    return {
      id:            row.id,
      type:          row.document_type,
      filename:      row.filename,
      attachedLabel,
      attachedKind,
      horseId:       row.horse_id,
      personId:      row.person_id,
      signedAt:      row.signed_at,
      expiresAt:     row.expires_at,
      uploadedAt:    row.uploaded_at,
      notes:         row.notes,
    }
  })
}

/** Loaded once to populate the upload dialog's attach-to pickers. Small
 *  enough at MR scale to ship in one payload; pagination isn't worth it yet. */
export type AttachOption = {
  id:    string
  label: string
}

export async function loadAttachOptions(): Promise<{ horses: AttachOption[]; people: AttachOption[] }> {
  const db = createAdminClient()

  const [{ data: horses }, { data: people }] = await Promise.all([
    db.from('horse').select('id, barn_name').is('deleted_at', null).order('barn_name'),
    db.from('person').select('id, first_name, last_name, preferred_name, is_organization, organization_name').is('deleted_at', null),
  ])

  return {
    horses: (horses ?? []).map(h => ({ id: h.id, label: h.barn_name ?? 'Unnamed' })),
    people: (people ?? [])
      .map(p => ({ id: p.id, label: displayName(p) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  }
}
