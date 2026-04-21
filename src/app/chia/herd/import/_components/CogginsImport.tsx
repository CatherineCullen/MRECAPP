'use client'

import { useState, useTransition } from 'react'
import ImportFlow from './ImportFlow'
import CogginsManualForm from './CogginsManualForm'
import { addCoggins } from '../actions'
import { createClient } from '@/lib/supabase/client'
import SearchPicker from '@/components/SearchPicker'

type Mode = 'manual' | 'ai'

type HorseOption = { id: string; barn_name: string; registered_name?: string | null }

type HealthEvent = {
  item_name:       string
  administered_on: string
  next_due:        string | null
  administered_by: string | null
  lot_number:      string | null
  result:          string | null
}

type ParsedData = {
  horse?: {
    name_on_document: string | null
    registered_name:  string | null
  }
  coggins: {
    date_drawn:         string | null
    vet_name:           string | null
    form_serial_number: string | null
  }
  health_events: HealthEvent[]
  clarifications: string[]
}

// Try to identify the horse on the Coggins certificate against the
// active roster. Returns the horse id if exactly one matches; null if
// none or ambiguous (so the admin is still forced to pick). Mirrors
// autoMatchHorse in VetRecordImport.
function autoMatchHorse(hint: ParsedData['horse'], horses: HorseOption[]): string | null {
  const candidates = [hint?.name_on_document, hint?.registered_name]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map(s => s.trim().toLowerCase())
  if (candidates.length === 0) return null

  const matches = horses.filter(h => {
    const names = [h.barn_name, h.registered_name ?? '']
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
    return candidates.some(c => names.includes(c))
  })

  return matches.length === 1 ? matches[0].id : null
}

function parseCogginsJson(raw: string): { ok: true; data: ParsedData } | { ok: false; message: string } {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const data = JSON.parse(stripped) as ParsedData
    if (!data.coggins || typeof data.coggins !== 'object') {
      return { ok: false, message: 'JSON is missing the "coggins" object.' }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, message: 'Could not parse JSON. Make sure the AI returned only the JSON object with no surrounding text.' }
  }
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-[#c4c6d1] rounded px-3 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
      />
    </div>
  )
}

function ReviewCards({
  data,
  horses,
  initialHorseId,
  onReset,
}: {
  data: ParsedData
  horses: HorseOption[]
  initialHorseId: string | null
  onReset: () => void
}) {
  // Horse auto-match from the AI's horse hint. initialHorseId (from the
  // ?horse_id query param) wins; otherwise fall back to the name match.
  const autoMatchedHorseId = autoMatchHorse(data.horse, horses)
  const [horseId,     setHorseId]   = useState<string | null>(initialHorseId ?? autoMatchedHorseId)
  const [coggins,     setCoggins]   = useState(data.coggins)
  const [events,      setEvents]    = useState<HealthEvent[]>(data.health_events ?? [])
  const [pdfFile,     setPdfFile]   = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  function updateCoggins(k: keyof typeof coggins, v: string) {
    setCoggins(prev => ({ ...prev, [k]: v || null }))
  }
  function updateEvent(i: number, k: keyof HealthEvent, v: string) {
    setEvents(prev => prev.map((e, idx) => idx === i ? { ...e, [k]: v || null } : e))
  }
  function removeEvent(i: number) {
    setEvents(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setUploadError(null)

    if (!horseId) {
      setUploadError('Please select a horse.')
      return
    }
    if (!pdfFile) {
      setUploadError('Please attach the Coggins PDF before saving.')
      return
    }

    startTransition(async () => {
      try {
        const supabase    = createClient()
        const ext         = pdfFile.name.split('.').pop() ?? 'pdf'
        const storagePath = `coggins/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, pdfFile, { contentType: pdfFile.type, upsert: false })

        if (uploadErr) {
          setUploadError(`Upload failed: ${uploadErr.message}`)
          return
        }

        await addCoggins(horseId, {
          coggins,
          health_events: events,
          document: {
            storagePath,
            filename:   pdfFile.name,
            uploadedAt: new Date().toISOString(),
          },
        })
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const horseOptions = horses.map(h => ({ id: h.id, label: h.barn_name }))

  return (
    <div className="space-y-4">
      {/* Clarifications */}
      {data.clarifications?.length > 0 && (
        <div className="bg-[#ffddb3] rounded-lg p-4">
          <div className="text-xs font-semibold text-[#7c4b00] uppercase tracking-wider mb-2">AI couldn't determine</div>
          <ul className="text-sm text-[#7c4b00] space-y-1 list-disc list-inside">
            {data.clarifications.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Horse picker — no overflow-hidden so SearchPicker's dropdown isn't clipped */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-2.5 bg-[#f2f4f7] rounded-t-lg flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Horse <span className="text-[#b00020]">*</span></h3>
          {data.horse?.name_on_document && (
            <span className="text-[10px] text-[#444650] normal-case tracking-normal">
              {autoMatchedHorseId
                ? <>Auto-matched from document: <strong className="text-[#1a6b3c]">{data.horse.name_on_document}</strong></>
                : <>Document says: <strong>{data.horse.name_on_document}</strong> — no unique match, please pick.</>
              }
            </span>
          )}
        </div>
        <div className="p-4">
          <SearchPicker
            name="horse_id"
            options={horseOptions}
            placeholder="Search horses…"
            required
            initialValue={
              (initialHorseId && horseOptions.find(h => h.id === initialHorseId)) ||
              (autoMatchedHorseId && horseOptions.find(h => h.id === autoMatchedHorseId)) ||
              null
            }
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
          <Field label="Date Drawn" type="date" value={coggins.date_drawn ?? ''} onChange={v => updateCoggins('date_drawn', v)} />
          <Field label="Vet Name"           value={coggins.vet_name           ?? ''} onChange={v => updateCoggins('vet_name', v)} />
          <Field label="Form Serial Number" value={coggins.form_serial_number ?? ''} onChange={v => updateCoggins('form_serial_number', v)} />
        </div>
      </div>

      {/* Health Events */}
      {events.length > 0 && (
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-[#f2f4f7]">
            <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Health Events ({events.length})</h3>
          </div>
          <div className="divide-y divide-[#f2f4f7]">
            {events.map((ev, i) => (
              <div key={i} className="p-4">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Item"            value={ev.item_name       ?? ''} onChange={v => updateEvent(i, 'item_name', v)} />
                  <Field label="Administered On" value={ev.administered_on ?? ''} onChange={v => updateEvent(i, 'administered_on', v)} />
                  <Field label="Next Due"        value={ev.next_due        ?? ''} onChange={v => updateEvent(i, 'next_due', v)} />
                  <Field label="Administered By" value={ev.administered_by ?? ''} onChange={v => updateEvent(i, 'administered_by', v)} />
                  <Field label="Lot Number"      value={ev.lot_number      ?? ''} onChange={v => updateEvent(i, 'lot_number', v)} />
                </div>
                <button onClick={() => removeEvent(i)} className="mt-2 text-xs text-[#b00020] hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <button
                onClick={() => setPdfFile(null)}
                className="text-xs text-[#b00020] hover:underline"
              >
                Remove
              </button>
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

      {/* Error */}
      {uploadError && (
        <div className="text-xs text-[#b00020] bg-[#ffdad6] rounded px-3 py-2">{uploadError}</div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isPending || !horseId}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Confirm & Save →'}
        </button>
        <button onClick={onReset} className="text-sm text-[#444650] hover:text-[#191c1e]">
          Start over
        </button>
      </div>
    </div>
  )
}

export default function CogginsImport({
  prompt,
  horses,
  initialHorseId,
  initialMode = 'manual',
}: {
  prompt: { body: string; description: string | null }
  horses: HorseOption[]
  initialHorseId: string | null
  initialMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)

  if (mode === 'manual') {
    return <CogginsManualForm horses={horses} initialHorseId={initialHorseId} onSwitchToAi={() => setMode('ai')} />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button onClick={() => setMode('manual')} className="text-xs font-semibold text-[#056380] hover:text-[#002058]">
          ← Back to manual entry
        </button>
      </div>
      <ImportFlow
        promptBody={prompt.body}
        description={prompt.description}
        jsonPlaceholder={'{\n  "coggins": { "date_drawn": null, "vet_name": null, "form_serial_number": null },\n  "health_events": [],\n  "clarifications": []\n}'}
        onParse={parseCogginsJson}
      >
        {(data, onReset) => (
          <ReviewCards
            data={data as ParsedData}
            horses={horses}
            initialHorseId={initialHorseId}
            onReset={onReset}
          />
        )}
      </ImportFlow>
    </div>
  )
}
