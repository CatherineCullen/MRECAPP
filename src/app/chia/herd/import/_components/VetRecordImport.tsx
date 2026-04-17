'use client'

import { useState, useTransition } from 'react'
import ImportFlow from './ImportFlow'
import { addVetRecord } from '../actions'
import { createClient } from '@/lib/supabase/client'
import SearchPicker from '@/components/SearchPicker'

type HorseOption = { id: string; barn_name: string }

type HealthEvent = {
  catalog_match:   string | null
  item_name:       string
  administered_on: string
  next_due:        string | null
  result:          string | null
  lot_number:      string | null
}

type CarePlan = {
  content:      string
  starts_on:    string | null
  ends_on:      string | null
  source_quote: string | null
}

type ParsedData = {
  visit: {
    visit_date:      string | null
    vet_name:        string | null
    findings:        string | null
    recommendations: string | null
  }
  health_events: HealthEvent[]
  care_plans:    CarePlan[]
  clarifications: string[]
}

function parseVetJson(raw: string): { ok: true; data: ParsedData } | { ok: false; message: string } {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const data = JSON.parse(stripped) as ParsedData
    if (!data.visit || typeof data.visit !== 'object') {
      return { ok: false, message: 'JSON is missing the "visit" object.' }
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

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-[#c4c6d1] rounded px-3 py-1.5 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
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
  data:           ParsedData
  horses:         HorseOption[]
  initialHorseId: string | null
  onReset:        () => void
}) {
  const [horseId,      setHorseId]     = useState<string | null>(initialHorseId)
  const [visit,        setVisit]       = useState(data.visit)
  const [events,       setEvents]      = useState<HealthEvent[]>(data.health_events ?? [])
  const [plans,        setPlans]       = useState<CarePlan[]>(data.care_plans ?? [])
  const [pdfFile,      setPdfFile]     = useState<File | null>(null)
  const [uploadError,  setUploadError] = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()

  function updateVisit(k: keyof typeof visit, v: string) {
    setVisit(prev => ({ ...prev, [k]: v || null }))
  }
  function updateEvent(i: number, k: keyof HealthEvent, v: string) {
    setEvents(prev => prev.map((e, idx) => idx === i ? { ...e, [k]: v || null } : e))
  }
  function removeEvent(i: number) {
    setEvents(prev => prev.filter((_, idx) => idx !== i))
  }
  function updatePlan(i: number, k: keyof CarePlan, v: string) {
    setPlans(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v || null } : p))
  }
  function removePlan(i: number) {
    setPlans(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setUploadError(null)

    if (!horseId) {
      setUploadError('Please select a horse.')
      return
    }
    if (!visit.visit_date) {
      setUploadError('Visit date is required.')
      return
    }

    startTransition(async () => {
      try {
        let document = null

        if (pdfFile) {
          const supabase   = createClient()
          const ext        = pdfFile.name.split('.').pop() ?? 'pdf'
          const storagePath = `vet-records/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

          const { error: uploadErr } = await supabase.storage
            .from('documents')
            .upload(storagePath, pdfFile, { contentType: pdfFile.type, upsert: false })

          if (uploadErr) {
            setUploadError(`Upload failed: ${uploadErr.message}`)
            return
          }
          document = { storagePath, filename: pdfFile.name, uploadedAt: new Date().toISOString() }
        }

        await addVetRecord(horseId, {
          visit:         { ...visit, visit_date: visit.visit_date! },
          health_events: events,
          care_plans:    plans,
          document,
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

      {/* Horse picker — overflow-visible so SearchPicker's dropdown isn't clipped */}
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

      {/* Visit */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7]">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Visit</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Visit Date *" type="date" value={visit.visit_date ?? ''} onChange={v => updateVisit('visit_date', v)} />
            <Field label="Vet Name"                 value={visit.vet_name   ?? ''} onChange={v => updateVisit('vet_name', v)} />
          </div>
          <TextArea label="Findings"        value={visit.findings        ?? ''} onChange={v => updateVisit('findings', v)} rows={3} />
          <TextArea label="Recommendations" value={visit.recommendations ?? ''} onChange={v => updateVisit('recommendations', v)} rows={2} />
        </div>
      </div>

      {/* Temporary Care Plans */}
      {plans.length > 0 && (
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-[#f2f4f7]">
            <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Temporary Care Plans ({plans.length})</h3>
          </div>
          <div className="divide-y divide-[#f2f4f7]">
            {plans.map((cp, i) => (
              <div key={i} className="p-4 border-l-4 border-[#ffddb3]">
                <div className="space-y-3">
                  <TextArea label="Instructions" value={cp.content ?? ''} onChange={v => updatePlan(i, 'content', v)} rows={2} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Starts on" type="date" value={cp.starts_on ?? ''} onChange={v => updatePlan(i, 'starts_on', v)} />
                    <Field label="Ends on"   type="date" value={cp.ends_on   ?? ''} onChange={v => updatePlan(i, 'ends_on', v)} />
                  </div>
                  {cp.source_quote !== null && (
                    <TextArea label="Source quote" value={cp.source_quote ?? ''} onChange={v => updatePlan(i, 'source_quote', v)} rows={2} />
                  )}
                </div>
                <button onClick={() => removePlan(i)} className="mt-2 text-xs text-[#b00020] hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health Events */}
      {events.length > 0 && (
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-[#f2f4f7]">
            <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Health Events ({events.length})</h3>
          </div>
          <div className="divide-y divide-[#f2f4f7]">
            {events.map((ev, i) => (
              <div key={i} className="p-4">
                {ev.catalog_match && ev.catalog_match !== ev.item_name && (
                  <div className="mb-2 text-xs text-[#056380]">→ matched to catalog: {ev.catalog_match}</div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Item"            value={ev.item_name       ?? ''} onChange={v => updateEvent(i, 'item_name', v)} />
                  <Field label="Administered on" type="date" value={ev.administered_on ?? ''} onChange={v => updateEvent(i, 'administered_on', v)} />
                  <Field label="Next due"        type="date" value={ev.next_due        ?? ''} onChange={v => updateEvent(i, 'next_due', v)} />
                  <Field label="Result"          value={ev.result          ?? ''} onChange={v => updateEvent(i, 'result', v)} />
                  <Field label="Lot number"      value={ev.lot_number      ?? ''} onChange={v => updateEvent(i, 'lot_number', v)} />
                </div>
                <button onClick={() => removeEvent(i)} className="mt-2 text-xs text-[#b00020] hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF Upload — optional */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7]">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Vet Record PDF <span className="text-[10px] font-normal text-[#444650] normal-case tracking-normal">(optional)</span></h3>
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

      {uploadError && (
        <div className="text-xs text-[#b00020] bg-[#ffdad6] rounded px-3 py-2">{uploadError}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isPending || !horseId || !visit.visit_date}
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

export default function VetRecordImport({
  prompt,
  horses,
  initialHorseId,
}: {
  prompt:         { body: string; description: string | null }
  horses:         HorseOption[]
  initialHorseId: string | null
}) {
  return (
    <ImportFlow
      promptBody={prompt.body}
      description={prompt.description}
      jsonPlaceholder={'{\n  "visit": { "visit_date": null, "vet_name": null, "findings": null, "recommendations": null },\n  "health_events": [],\n  "care_plans": [],\n  "clarifications": []\n}'}
      onParse={parseVetJson}
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
  )
}
