'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DOCUMENT_TYPES, ATTACHES_TO, type DocumentType } from '../_lib/documentTypes'
import { createDocument } from '../actions'
import type { AttachOption } from '../_lib/loadDocuments'

// Admin upload dialog. Pre-select `lockedPersonId` / `lockedHorseId` when
// the dialog opens from a per-entity section — the attach-to picker is
// hidden in that case since the attachment is already known.

type Props = {
  horses:          AttachOption[]
  people:          AttachOption[]
  lockedPersonId?: string
  lockedHorseId?:  string
  /** Restrict the type dropdown (e.g., per-entity sections that only ever
   *  attach certain types). Defaults to all DOCUMENT_TYPES. */
  allowedTypes?:   readonly DocumentType[]
  onClose:         () => void
}

export default function UploadDocumentDialog({
  horses, people, lockedPersonId, lockedHorseId, allowedTypes, onClose,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const types = allowedTypes ?? DOCUMENT_TYPES

  const [type, setType] = useState<DocumentType>(
    // Pick a sensible default: if locked to a horse, start at Coggins; if
    // locked to a person, start at Waiver; otherwise first in the list.
    lockedHorseId ? 'Coggins' : lockedPersonId ? 'Waiver' : types[0],
  )
  const [horseId, setHorseId]   = useState(lockedHorseId ?? '')
  const [personId, setPersonId] = useState(lockedPersonId ?? '')
  const [signedAt, setSignedAt] = useState('')
  const [notes, setNotes]       = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const attachTarget = ATTACHES_TO[type]
  const needsHorse   = !lockedHorseId  && (attachTarget === 'horse'  || attachTarget === 'either')
  const needsPerson  = !lockedPersonId && (attachTarget === 'person' || attachTarget === 'either')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Pick a file to upload.'); return }

    // Attachment validation depends on the type's target.
    const effectivePersonId = lockedPersonId ?? (attachTarget === 'person' || attachTarget === 'either' ? personId : '')
    const effectiveHorseId  = lockedHorseId  ?? (attachTarget === 'horse'  || attachTarget === 'either' ? horseId  : '')
    if (attachTarget === 'person' && !effectivePersonId) { setError('Pick a person to attach to.'); return }
    if (attachTarget === 'horse'  && !effectiveHorseId)  { setError('Pick a horse to attach to.');  return }
    if (attachTarget === 'either' && !effectivePersonId && !effectiveHorseId) {
      setError('Pick a person or a horse to attach to.'); return
    }

    // 1. Upload file to storage bucket. Client-side upload — same pattern
    //    as Coggins/Vet imports.
    setProgress('Uploading…')
    const supabase    = createClient()
    const ext         = file.name.split('.').pop() ?? 'bin'
    const storagePath = `misc/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false })
    if (uploadErr) { setProgress(null); setError(`Upload failed: ${uploadErr.message}`); return }

    // 2. Persist row.
    setProgress('Saving…')
    startTransition(async () => {
      const res = await createDocument({
        type,
        filename:    file.name,
        storagePath,
        personId:    effectivePersonId || null,
        horseId:     effectiveHorseId  || null,
        signedAt:    signedAt || null,
        expiresAt:   null,   // v1: not exposed in UI for admin-upload path
        notes:       notes.trim() || null,
      })
      setProgress(null)
      if (res.error) { setError(res.error); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4"
      >
        <h2 className="text-base font-bold text-[#191c1e]">Upload document</h2>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-[#444650] mb-1">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as DocumentType)}
            className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm"
          >
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* File */}
        <div>
          <label className="block text-xs font-semibold text-[#444650] mb-1">File</label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.heic"
            className="block text-sm w-full"
          />
        </div>

        {/* Attach to — horse */}
        {needsHorse && (
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">
              Horse {attachTarget === 'either' && <span className="font-normal text-[#6b6e7a]">(optional)</span>}
            </label>
            <select
              value={horseId}
              onChange={e => setHorseId(e.target.value)}
              className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm"
            >
              <option value="">— select horse —</option>
              {horses.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </div>
        )}

        {/* Attach to — person */}
        {needsPerson && (
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">
              Person {attachTarget === 'either' && <span className="font-normal text-[#6b6e7a]">(optional)</span>}
            </label>
            <select
              value={personId}
              onChange={e => setPersonId(e.target.value)}
              className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm"
            >
              <option value="">— select person —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        )}

        {/* Signed date (only meaningful for Waiver / Boarding Agreement) */}
        {(type === 'Waiver' || type === 'Boarding Agreement') && (
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Signed on</label>
            <input
              type="date"
              value={signedAt}
              onChange={e => setSignedAt(e.target.value)}
              className="border border-[#c4c6d1] rounded px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-[#444650] mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm"
            placeholder={type === 'Other' ? 'e.g., Lease — Babe' : ''}
          />
        </div>

        {error    && <div className="text-xs text-[#b3261e]">{error}</div>}
        {progress && <div className="text-xs text-[#444650]">{progress}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-[#444650] hover:text-[#191c1e]" disabled={isPending}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-semibold text-white bg-[#002058] rounded hover:bg-[#001540] disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  )
}
