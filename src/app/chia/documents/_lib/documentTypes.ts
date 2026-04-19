// Canonical list of document types shown in the upload dropdown and used
// for filter + dashboard queries. Schema stores this as free `text` so new
// values don't require migrations, but the UI only offers these options.
//
// Rules by type (summarized — full logic lives in documents.md):
//
//   Waiver              Person-only. Never expires. Cannot be hard-deleted
//                        (soft-delete only — a deleted waiver flips
//                        has_signed_waiver to false, which we want to preserve
//                        as a signal). Self-serve signing flow arrives in v1b.
//
//   Boarding Agreement   Person-only. No expiry. Self-serve signing v1b.
//
//   Coggins              Horse-only. Annual expiry, but tracked on the
//                        `coggins` table (not document.expires_at). Uploads
//                        here are primarily through the Coggins import flow
//                        already built on the horse record; admin can still
//                        upload a loose Coggins PDF here.
//
//   Vet Record           Horse-only. No expiry. Most arrive via the vet
//                        import flow; this type supports loose uploads.
//
//   Vaccine Certificate  Horse-only. Optional. No expiry tracking — it's
//                        filed for show-prep convenience; some vets send a
//                        separate cert, others bundle it into the vet record.
//
//   Other                Either. Admin-set free-text notes carry the detail.
//                        Lease agreements file here with a note like
//                        "Lease — Horse X" (no expiry tracking by design).

export const DOCUMENT_TYPES = [
  'Waiver',
  'Boarding Agreement',
  'Coggins',
  'Vet Record',
  'Vaccine Certificate',
  'Other',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** True iff the type is valid. Free-text rows outside this list are legal in
 *  the DB (legacy imports, future types) but won't round-trip through the
 *  dropdown cleanly — they display as "Other" with the raw string in notes. */
export function isKnownDocumentType(s: string): s is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(s)
}

/** Which entity each type attaches to. Drives the attach-to picker in the
 *  upload form — Waiver goes to Person search, Coggins to Horse search, etc. */
export const ATTACHES_TO: Record<DocumentType, 'person' | 'horse' | 'either'> = {
  'Waiver':              'person',
  'Boarding Agreement':  'person',
  'Coggins':             'horse',
  'Vet Record':          'horse',
  'Vaccine Certificate': 'horse',
  'Other':               'either',
}

/** Waiver is uniquely protected — the has_signed_waiver derived signal
 *  depends on a non-soft-deleted row existing. Hard-delete would destroy
 *  history; soft-delete flips the flag. The UI refuses either path. */
export function isProtectedFromDelete(type: string): boolean {
  return type === 'Waiver'
}
