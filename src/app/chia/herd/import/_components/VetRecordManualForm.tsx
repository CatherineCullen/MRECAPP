'use client'

import { useState, useTransition } from 'react'
import { addVetRecord } from '../actions'
import { createClient } from '@/lib/supabase/client'
import SearchPicker from '@/components/SearchPicker'
import type { CatalogEntry } from './ImportTools'

type HorseOption = { id: string; barn_name: string; registered_name?: string | null }

const CREATE_NEW = '__create_new__'

type HealthEvent = {
  item_name:           string
  administered_on:     string
  next_due:            string
  notes:               string
  health_item_type_id: string  // UUID or CREATE_NEW
}

type CarePlan = {
  content:   string
  starts_on: string
  ends_on:   string
}

function emptyEvent(): HealthEvent {
  return { item_name: '', administered_on: '', next_due: '', notes: '', health_item_type_id: CREATE_NEW }
}
function emptyPlan(): CarePlan {
  return { content: '', starts_on: '', ends_on: '' }
}

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

export default function VetRecordManualForm({
  horses,
  catalog,
  initialHorseId,
  onSwitchToAi,
}: {
  horses:         HorseOption[]
  catalog:        CatalogEntry[]
  initialHorseId: string | null
  onSwitchToAi:   () => void
}) {
  const [horseId,     setHorseId]     = useState<string | null>(initialHorseId)
  const [visitDate,   setVisitDate]   = useState('')
  const [vetName,     setVetName]     = useState('')
  const [findings,    setFindings]    = useState('')
  const [recs,        setRecs]        = useState('')
  const [events,      setEvents]      = useState<HealthEvent[]>([])
  const [plans,       setPlans]       = useState<CarePlan[]>([])
  const [pdfFile,     setPdfFile]     = useState<File | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  const horseOptions = horses.map(h => ({ id: h.id, label: h.barn_name }))

  function updateEvent(i: number, k: keyof HealthEvent, v: string) {
    setEvents(prev => prev.map((e, idx) => idx === i ? { ...e, [k]: v } : e))
  }
  function updatePlan(i: number, k: keyof CarePlan, v: string) {
    setPlans(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p))
  }

  async function handleSubmit() {
    setError(null)
    if (!horseId)   { setError('Please select a horse.'); return }
    if (!visitDate) { setError('Visit date is required.'); return }

    // Validate health events
    for (const ev of events) {
      if (!ev.item_name.trim())       { setError('Each health event needs an item name.'); return }
      if (!ev.administered_on)        { setError('Each health event needs an administered-on date.'); return }
    }
    for (const cp of plans) {
      if (!cp.content.trim())         { setError('Each care plan needs instructions.'); return }
    }

    startTransition(async () => {
      try {
        let document = null

        if (pdfFile) {
          const supabase    = createClient()
          const ext         = pdfFile.name.split('.').pop() ?? 'pdf'
          const storagePath = `vet-records/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

          const { error: uploadErr } = await supabase.storage
            .from('documents')
            .upload(storagePath, pdfFile, { contentType: pdfFile.type, upsert: false })

          if (uploadErr) { setError(`Upload failed: ${uploadErr.message}`); return }
          document = { storagePath, filename: pdfFile.name, uploadedAt: new Date().toISOString() }
        }

        await addVetRecord(horseId, {
          visit: {
            visit_date:      visitDate,
            vet_name:        vetName  || null,
            findings:        findings || null,
            recommendations: recs     || null,
          },
          health_events: events.map(ev => ({
            catalog_match:       null,
            item_name:           ev.item_name,
            administered_on:     ev.administered_on,
            next_due:            ev.next_due || null,
            notes:               ev.notes    || null,
            health_item_type_id: ev.health_item_type_id === CREATE_NEW ? null : ev.health_item_type_id,
          })),
          care_plans: plans.map(cp => ({
            content:      cp.content,
            starts_on:    cp.starts_on || null,
            ends_on:      cp.ends_on   || null,
            source_quote: null,
          })),
          document,
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

      {/* Visit */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7]">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Visit</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Visit Date" type="date" required value={visitDate} onChange={setVisitDate} />
            <Field label="Vet Name"                       value={vetName}   onChange={setVetName} />
          </div>
          <TextArea label="Findings"        value={findings} onChange={setFindings} rows={3} />
          <TextArea label="Recommendations" value={recs}     onChange={setRecs}     rows={2} />
        </div>
      </div>

      {/* Temporary Care Plans */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Temporary Care Plans</h3>
          <button onClick={() => setPlans(p => [...p, emptyPlan()])} className="text-xs font-semibold text-[#056380] hover:text-[#002058]">
            + Add care plan
          </button>
        </div>
        {plans.length === 0 ? (
          <div className="px-4 py-3 text-sm text-[#444650]">None.</div>
        ) : (
          <div className="divide-y divide-[#f2f4f7]">
            {plans.map((cp, i) => (
              <div key={i} className="p-4 border-l-4 border-[#ffddb3]">
                <div className="space-y-3">
                  <TextArea label="Instructions" value={cp.content} onChange={v => updatePlan(i, 'content', v)} rows={2} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Starts on" type="date" value={cp.starts_on} onChange={v => updatePlan(i, 'starts_on', v)} />
                    <Field label="Ends on"   type="date" value={cp.ends_on}   onChange={v => updatePlan(i, 'ends_on', v)} />
                  </div>
                </div>
                <button onClick={() => setPlans(prev => prev.filter((_, idx) => idx !== i))} className="mt-2 text-xs text-[#b00020] hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Health Events */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Health Events</h3>
          <button onClick={() => setEvents(e => [...e, emptyEvent()])} className="text-xs font-semibold text-[#056380] hover:text-[#002058]">
            + Add health event
          </button>
        </div>
        {events.length === 0 ? (
          <div className="px-4 py-3 text-sm text-[#444650]">None.</div>
        ) : (
          <div className="divide-y divide-[#f2f4f7]">
            {events.map((ev, i) => {
              const isCreating = ev.health_item_type_id === CREATE_NEW
              const matched    = !isCreating ? catalog.find(c => c.id === ev.health_item_type_id) : null
              return (
                <div key={i} className="p-4">
                  <div className="mb-3 flex items-center gap-3 flex-wrap">
                    {isCreating ? (
                      <span className="text-[10px] font-semibold bg-[#ffddb3] text-[#7c4b00] px-2 py-0.5 rounded uppercase tracking-wider">
                        Will create new
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-[#b7f0d0] text-[#1a6b3c] px-2 py-0.5 rounded uppercase tracking-wider">
                        Match: {matched?.name ?? '?'}
                      </span>
                    )}
                    <label className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Catalog type</label>
                    <select
                      value={ev.health_item_type_id}
                      onChange={e => updateEvent(i, 'health_item_type_id', e.target.value)}
                      className="border border-[#c4c6d1] rounded px-2 py-1 text-xs text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
                    >
                      <option value={CREATE_NEW}>➕ Create new from item name</option>
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
                    <Field label="Item"            required value={ev.item_name}       onChange={v => updateEvent(i, 'item_name', v)} />
                    <Field label="Administered on" required type="date" value={ev.administered_on} onChange={v => updateEvent(i, 'administered_on', v)} />
                    <Field label="Next due"        type="date" value={ev.next_due}        onChange={v => updateEvent(i, 'next_due', v)} />
                  </div>
                  <div className="mt-3">
                    <TextArea label="Notes" value={ev.notes} onChange={v => updateEvent(i, 'notes', v)} rows={2} />
                  </div>
                  <button onClick={() => setEvents(prev => prev.filter((_, idx) => idx !== i))} className="mt-2 text-xs text-[#b00020] hover:underline">
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* PDF — optional */}
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f2f4f7]">
          <h3 className="text-xs font-semibold text-[#444650] uppercase tracking-wider">
            Vet Record PDF <span className="text-[10px] font-normal text-[#444650] normal-case tracking-normal">(optional)</span>
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
          disabled={isPending || !horseId || !visitDate}
          className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save Vet Record →'}
        </button>
      </div>
    </div>
  )
}
