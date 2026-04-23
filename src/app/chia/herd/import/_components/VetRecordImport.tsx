'use client'

import { useState, useTransition } from 'react'
import ImportFlow from './ImportFlow'
import VetRecordManualForm from './VetRecordManualForm'
import { addVetRecord } from '../actions'
import { createClient } from '@/lib/supabase/client'
import SearchPicker from '@/components/SearchPicker'
import type { CatalogEntry } from './ImportTools'

type Mode = 'manual' | 'ai'

type HorseOption = { id: string; barn_name: string; registered_name?: string | null }

// CREATE_NEW is a sentinel the Review UI uses for its per-event picker:
// "not matched to any catalog entry — create a new type from item_name".
// Sent to the server as health_item_type_id = null.
const CREATE_NEW = '__create_new__'

type HealthEvent = {
  catalog_match:       string | null
  item_name:           string
  administered_on:     string
  next_due:            string | null
  // Freeform catch-all — everything the AI extracts (product name, lot
  // #, administrator, result) goes here. Admin can edit before save.
  notes:               string | null
  // Client-side: which catalog type the admin has selected. UUID = use
  // existing; CREATE_NEW = create from item_name on save.
  health_item_type_id: string | null
}

type CarePlan = {
  content:      string
  starts_on:    string | null
  ends_on:      string | null
  source_quote: string | null
}

type ParsedData = {
  horse?: {
    name_on_document: string | null
    registered_name:  string | null
  }
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

// Try to identify the horse on the vet document against the active
// roster. Returns the horse id if exactly one matches; null if none or
// ambiguous (so the admin is still forced to pick).
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

function parseVetJson(raw: string): { ok: true; data: ParsedData } | { ok: false; message: string } {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    .replace(/\s*\[cite:[^\]]*\]/g, '')  // strip Gemini citation annotations
    .trim()
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
  catalog,
  initialHorseId,
  onReset,
}: {
  data:           ParsedData
  horses:         HorseOption[]
  catalog:        CatalogEntry[]
  initialHorseId: string | null
  onReset:        () => void
}) {
  // On mount, pre-match each event to a catalog entry by name (case
  // insensitive), preferring catalog_match over item_name. If neither
  // hits, default to CREATE_NEW — the admin can flip it to an existing
  // entry via the per-event picker.
  const catalogByName = new Map(catalog.map(c => [c.name.toLowerCase(), c]))

  // The prompt injects catalog entries as "Name (essential), every N days".
  // The AI echoes the suffix back in catalog_match, so strip any parenthetical
  // or trailing descriptor before looking up in the name map.
  const stripMatchSuffix = (s: string) => s.replace(/\s*\(.*$/, '').replace(/\s*,.*$/, '').trim()

  const initialEvents: HealthEvent[] = (data.health_events ?? []).map(e => {
    const matchKey = e.catalog_match ? stripMatchSuffix(e.catalog_match).toLowerCase() : null
    const matched =
      (matchKey && catalogByName.get(matchKey)) ||
      catalogByName.get(e.item_name.toLowerCase()) ||
      null
    return {
      catalog_match:       e.catalog_match ?? null,
      item_name:           e.item_name,
      administered_on:     e.administered_on,
      next_due:            e.next_due ?? null,
      notes:               e.notes ?? null,
      health_item_type_id: matched?.id ?? CREATE_NEW,
    }
  })

  // Horse auto-match from the AI's horse hint. initialHorseId (from the
  // ?horse_id query param) wins; otherwise fall back to the name match.
  const autoMatchedHorseId = autoMatchHorse(data.horse, horses)
  const [horseId,      setHorseId]     = useState<string | null>(initialHorseId ?? autoMatchedHorseId)
  const [visit,        setVisit]       = useState(data.visit)
  const [events,       setEvents]      = useState<HealthEvent[]>(initialEvents)
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
          health_events: events.map(e => ({
            ...e,
            // Server sees null = "create new from item_name"; a real UUID =
            // "link to existing type, don't create".
            health_item_type_id: e.health_item_type_id === CREATE_NEW ? null : e.health_item_type_id,
          })),
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
            {events.map((ev, i) => {
              const isCreating = ev.health_item_type_id === CREATE_NEW
              const matchedEntry = !isCreating
                ? catalog.find(c => c.id === ev.health_item_type_id)
                : null
              return (
                <div key={i} className="p-4">
                  {/* Match state badge + type picker. Always visible so admin
                      can see at a glance whether this row will create a new
                      catalog type or reuse an existing one, and flip it. */}
                  <div className="mb-3 flex items-center gap-3 flex-wrap">
                    {isCreating ? (
                      <span className="text-[10px] font-semibold bg-[#ffddb3] text-[#7c4b00] px-2 py-0.5 rounded uppercase tracking-wider">
                        Will create new
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-[#b7f0d0] text-[#1a6b3c] px-2 py-0.5 rounded uppercase tracking-wider">
                        Match: {matchedEntry?.name ?? '?'}
                      </span>
                    )}
                    <label className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">
                      Catalog type
                    </label>
                    <select
                      value={ev.health_item_type_id ?? CREATE_NEW}
                      onChange={e => updateEvent(i, 'health_item_type_id', e.target.value)}
                      className="border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
                    >
                      <option value={CREATE_NEW}>➕ Create new from &ldquo;{ev.item_name}&rdquo;</option>
                      <optgroup label="Essential">
                        {catalog.filter(c => c.is_essential).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Other">
                        {catalog.filter(c => !c.is_essential).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Item"            value={ev.item_name       ?? ''} onChange={v => updateEvent(i, 'item_name', v)} />
                    <Field label="Administered on" type="date" value={ev.administered_on ?? ''} onChange={v => updateEvent(i, 'administered_on', v)} />
                    <Field label="Next due"        type="date" value={ev.next_due        ?? ''} onChange={v => updateEvent(i, 'next_due', v)} />
                  </div>
                  <div className="mt-3">
                    <TextArea label="Notes" value={ev.notes ?? ''} onChange={v => updateEvent(i, 'notes', v)} rows={2} />
                  </div>
                  <button onClick={() => removeEvent(i)} className="mt-2 text-xs text-[#b00020] hover:underline">
                    Remove
                  </button>
                </div>
              )
            })}
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
  catalog,
  initialHorseId,
  initialMode = 'manual',
}: {
  prompt:         { body: string; description: string | null }
  horses:         HorseOption[]
  catalog:        CatalogEntry[]
  initialHorseId: string | null
  initialMode?:   Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)

  if (mode === 'manual') {
    return <VetRecordManualForm horses={horses} catalog={catalog} initialHorseId={initialHorseId} onSwitchToAi={() => setMode('ai')} />
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
        jsonPlaceholder={'{\n  "visit": { "visit_date": null, "vet_name": null, "findings": null, "recommendations": null },\n  "health_events": [],\n  "care_plans": [],\n  "clarifications": []\n}'}
        onParse={parseVetJson}
      >
        {(data, onReset) => (
          <ReviewCards
            data={data as ParsedData}
            horses={horses}
            catalog={catalog}
            initialHorseId={initialHorseId}
            onReset={onReset}
          />
        )}
      </ImportFlow>
    </div>
  )
}
