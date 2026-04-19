import { createAdminClient } from '@/lib/supabase/admin'
import AddDocumentButton from './AddDocumentButton'
import DocumentsList from './DocumentsList'
import { DOCUMENT_TYPES, type DocumentType } from '../_lib/documentTypes'
import { loadAttachOptions, type DocumentListRow } from '../_lib/loadDocuments'

// Reusable server component for horse + person record pages.
//
// We deliberately load the doc rows + attach options inline here rather than
// threading them through the parent record-page loader — it keeps record
// pages from ballooning and lets each section own its own data surface.

type Props =
  | { kind: 'horse';  id: string; label: string }
  | { kind: 'person'; id: string; label: string }

export default async function EntityDocumentsSection(props: Props) {
  const db = createAdminClient()

  // Per-entity, the allowed upload types narrow to what actually attaches to
  // that kind (plus "Other", which can go either way). Keeps the dropdown
  // honest and stops admin from mis-attaching at the source.
  const allowedTypes: readonly DocumentType[] = props.kind === 'horse'
    ? (['Coggins', 'Vet Record', 'Vaccine Certificate', 'Other'] as const)
    : (['Waiver', 'Boarding Agreement', 'Other'] as const)

  // Select only for the entity in question. Sorted most-recent first; we show
  // them all here since volume per entity is low (≤ a few dozen in practice).
  const col = props.kind === 'horse' ? 'horse_id' : 'person_id'
  const { data } = await db
    .from('document')
    .select('id, document_type, filename, person_id, horse_id, signed_at, expires_at, uploaded_at, notes')
    .eq(col, props.id)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  const rows: DocumentListRow[] = (data ?? []).map(r => ({
    id:            r.id,
    type:          r.document_type,
    filename:      r.filename,
    attachedLabel: props.label,          // already scoped; column is hidden
    attachedKind:  props.kind,
    horseId:       r.horse_id,
    personId:      r.person_id,
    signedAt:      r.signed_at,
    expiresAt:     r.expires_at,
    uploadedAt:    r.uploaded_at,
    notes:         r.notes,
  }))

  // Attach options for the upload dialog. The locked side is pre-selected and
  // the picker is hidden; we still need the other side populated in case the
  // type is "Other" and admin wants to cross-attach.
  const attach = await loadAttachOptions()

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
          Documents
        </h2>
        <AddDocumentButton
          horses={attach.horses}
          people={attach.people}
          lockedHorseId={props.kind === 'horse'   ? props.id : undefined}
          lockedPersonId={props.kind === 'person' ? props.id : undefined}
          allowedTypes={allowedTypes}
          label="Upload"
          variant="secondary"
        />
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#c4c6d1] italic">
          No documents yet.
        </div>
      ) : (
        <DocumentsList rows={rows} showAttachment={false} />
      )}
    </section>
  )
}

// Re-export the full type list for callers that want it (e.g., admin pages
// that want to override the narrowing above).
export { DOCUMENT_TYPES }
