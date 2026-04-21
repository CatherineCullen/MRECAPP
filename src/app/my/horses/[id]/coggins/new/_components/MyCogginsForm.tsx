'use client'

import { useState, useTransition } from 'react'
import { addMyCoggins } from '../actions'
import { createClient } from '@/lib/supabase/client'

export default function MyCogginsForm({ horseId, horseName }: { horseId: string; horseName: string }) {
  const [dateDrawn, setDateDrawn] = useState('')
  const [vetName,   setVetName]   = useState('')
  const [serial,    setSerial]    = useState('')
  const [pdfFile,   setPdfFile]   = useState<File | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit() {
    setError(null)
    if (!dateDrawn) { setError('Date drawn is required.');        return }
    if (!pdfFile)   { setError('Please attach the Coggins PDF.'); return }

    startTransition(async () => {
      try {
        const supabase    = createClient()
        const ext         = pdfFile.name.split('.').pop() ?? 'pdf'
        const storagePath = `coggins/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, pdfFile, { contentType: pdfFile.type, upsert: false })
        if (uploadErr) { setError(`Upload failed: ${uploadErr.message}`); return }

        await addMyCoggins(horseId, {
          date_drawn:         dateDrawn,
          vet_name:           vetName || null,
          form_serial_number: serial  || null,
          document: {
            storagePath,
            filename:   pdfFile.name,
            uploadedAt: new Date().toISOString(),
          },
        })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const inputCls = 'w-full border border-outline rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary bg-surface-lowest'
  const labelCls = 'block text-xs font-semibold text-on-surface-muted mb-1'

  return (
    <div className="space-y-3">
      <a href={`/my/horses/${horseId}`} className="text-xs font-semibold text-on-secondary-container">← {horseName}</a>

      <div className="bg-surface-lowest rounded-lg px-4 py-3 space-y-4">
        <div>
          <h1 className="text-base font-bold text-on-surface">Add Coggins</h1>
          <p className="text-xs text-on-surface-muted mt-0.5">
            Expires automatically 12 months after Date Drawn.
          </p>
        </div>

        <div>
          <label className={labelCls}>Date Drawn <span className="text-error">*</span></label>
          <input type="date" value={dateDrawn} onChange={e => setDateDrawn(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Vet Name</label>
          <input type="text" value={vetName} onChange={e => setVetName(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Form Serial Number</label>
          <input type="text" value={serial} onChange={e => setSerial(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Coggins PDF <span className="text-error">*</span></label>
          {pdfFile ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-on-surface font-medium break-all">{pdfFile.name}</span>
              <span className="text-xs text-on-surface-muted">({(pdfFile.size / 1024).toFixed(0)} KB)</span>
              <button type="button" onClick={() => setPdfFile(null)} className="text-xs text-error">Remove</button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 cursor-pointer border border-dashed border-outline rounded px-3 py-4 text-sm text-on-secondary-container">
              <span>Choose file…</span>
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        {error && (
          <div className="text-xs text-error bg-error-container rounded px-3 py-2">{error}</div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !dateDrawn || !pdfFile}
            className="bg-primary text-on-primary text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <a href={`/my/horses/${horseId}`} className="text-sm text-on-surface-muted">
            Cancel
          </a>
        </div>
      </div>
    </div>
  )
}
