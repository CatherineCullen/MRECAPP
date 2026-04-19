'use client'

import { useState } from 'react'
import UploadDocumentDialog from './UploadDocumentDialog'
import type { AttachOption } from '../_lib/loadDocuments'
import type { DocumentType } from '../_lib/documentTypes'

// Thin trigger + dialog wrapper. Used at the top-level Documents page and
// embedded per-entity sections. For per-entity sections the caller passes
// `lockedPersonId` / `lockedHorseId` and `allowedTypes` to narrow the flow.

type Props = {
  horses:          AttachOption[]
  people:          AttachOption[]
  lockedPersonId?: string
  lockedHorseId?:  string
  allowedTypes?:   readonly DocumentType[]
  label?:          string
  variant?:        'primary' | 'secondary'
}

export default function AddDocumentButton({
  horses, people, lockedPersonId, lockedHorseId, allowedTypes,
  label = 'Upload document', variant = 'primary',
}: Props) {
  const [open, setOpen] = useState(false)

  const cls = variant === 'primary'
    ? 'px-3 py-1.5 text-sm font-semibold text-white bg-[#002058] rounded hover:bg-[#001540]'
    : 'text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-2.5 py-1 rounded transition-colors'

  return (
    <>
      <button onClick={() => setOpen(true)} className={cls}>{label}</button>
      {open && (
        <UploadDocumentDialog
          horses={horses}
          people={people}
          lockedPersonId={lockedPersonId}
          lockedHorseId={lockedHorseId}
          allowedTypes={allowedTypes}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
