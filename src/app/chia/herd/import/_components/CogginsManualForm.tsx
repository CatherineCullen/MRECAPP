'use client'

import { useState, useTransition } from 'react'
import { addCoggins } from '../actions'
import { createClient } from '@/lib/supabase/client'
import SearchPicker from '@/components/SearchPicker'

type HorseOption = { id: string; barn_name: string; registered_name?: string | null }

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">
        {label}{required && <span className="text-[#b00020]"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-[#c4c6d1] rounded px-3 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
      />
    </div>
  )
}

export default function CogginsManualForm({
  horses,
  initialHorseId,
  onSwitchToAi,
}: {
  horses:         HorseOption[]
  initialHorseId: string | null
  onSwitchToAi:   () => void
}) {
  const [horseId,     setHorseId]     = useState<string | null>(initialHorseId)
  const [dateDrawn,   setDateDrawn]   = useState('')
  const [vetName,     setVetName]     = useState('')
  const [serial,      setSerial]      = useState('')
  const [pdfFile,     setPdfFile]     = useState<File | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  const horseOptions = horses.map(h => ({ id: h.id, label: h.barn_name }))

  async function handleSubmit() {
    setError(null)
    if (!horseId)   { setError('Please select a horse.');                return }
    if (!dateDrawn) { setError('Date drawn is required.');               return }
    if (!pdfFile)   { setError('Please attach the Coggins PDF.');        return }

    startTransition(async () => {
      try {
        const supabase    = createClient()
        const ext         = pdfFile.name.split('.').pop() ?? 'pdf'
        const storagePath = `coggins/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, pdfFile, { contentType: pdfFile.type, upsert: false })

        if (uploadErr) { setError(`Upload failed: ${uploadErr.message}`); return }

        await addCoggins(horseId, {
          coggins: {
            date_drawn:         dateDrawn,
            vet_name:           vetName || null,
            form_serial_number: serial  || null,
          },
          health_events: [],
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#444650]">Manual entry — fill in the fields below.</p>
        <button onClick={onSwitchToAi} className="text-xs font-semibold text-[#056380] hover:text-[#002058]">
          Have a PDF? Try AI assist →
        </button>
      </div>

      {/* Horse */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-2.5 bg-[#f2f4f7] rounded-t-lg">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Horse <span className="text-[#b00020]">*</span></h3>
        </div>
        <div className="p-4">
          <SearchPicker
            name="horse_id"
            options={horseOptions}
            placeholder="Search horses…"
            required
            initialValue={initialHorseId ? horseOptions.find(h => h.id === initialHorseId) ?? null : null}
            onSelect={opt => setHorseId(opt?.id ?? null)}
          />
        </div>
      </div>

      {/* Coggins fields */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7]">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Coggins</h3>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          <Field label="Date Drawn" type="date" required value={dateDrawn} onChange={setDateDrawn} />
          <Field label="Vet Name"           value={vetName} onChange={setVetName} />
          <Field label="Form Serial Number" value={serial}  onChange={setSerial} />
        </div>
        <div className="px-4 pb-4 -mt-1 text-[11px] text-[#444650]">
          Expires automatically 12 months after Date Drawn.
        </div>
      </div>

      {/* PDF Upload — required */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7]">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
            Coggins PDF <span className="text-[#b00020]">*</span>
          </h3>
        </div>
        <div className="p-4">
          {pdfFile ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#191c1e] font-medium">{pdfFile.name}</span>
              <span className="text-xs text-[#444650]">({(pdfFile.size / 1024).toFixed(0)} KB)</span>
              <button onClick={() => setPdfFile(null)} className="text-xs text-[#b00020] hover:underline">Remove</button>
            </div>
          ) : (
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-3 py-1.5 rounded">
                Choose file
              </span>
              <span className="text-xs text-[#444650]">PDF, JPG, or PNG — max 20 MB</span>
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs text-[#b00020] bg-[#ffdad6] rounded px-3 py-2">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isPending || !horseId || !dateDrawn || !pdfFile}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save Coggins →'}
        </button>
      </div>
    </div>
  )
}
