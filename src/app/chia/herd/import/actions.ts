'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

// ── Add Coggins to existing horse ─────────────────────────────

type AddCogginsPayload = {
  coggins: {
    date_drawn:         string | null
    vet_name:           string | null
    form_serial_number: string | null
  }
  health_events: {
    item_name:       string
    administered_on: string
    next_due:        string | null
    administered_by: string | null
    lot_number:      string | null
    result:          string | null
  }[]
  document: {
    storagePath: string
    filename:    string
    uploadedAt:  string
  }
}

export async function addCoggins(horseId: string, payload: AddCogginsPayload) {
  const supabase = createAdminClient()

  // 1. Create document record
  const { data: doc, error: docError } = await supabase
    .from('document')
    .insert({
      horse_id:      horseId,
      document_type: 'Coggins',
      file_url:      payload.document.storagePath,
      filename:      payload.document.filename,
      uploaded_at:   payload.document.uploadedAt,
    })
    .select('id')
    .single()

  if (docError) throw docError

  // 2. Create coggins record + sync health_program_item
  if (payload.coggins.date_drawn) {
    const { data: coggins, error: cogginsError } = await supabase
      .from('coggins')
      .insert({
        horse_id:           horseId,
        date_drawn:         payload.coggins.date_drawn,
        vet_name:           payload.coggins.vet_name,
        form_serial_number: payload.coggins.form_serial_number,
        document_id:        doc.id,
      })
      .select('expiry_date')
      .single()

    if (cogginsError) throw cogginsError

    const { data: cogginsType } = await supabase
      .from('health_item_type')
      .select('id')
      .eq('name', 'Coggins')
      .is('deleted_at', null)
      .maybeSingle()

    if (cogginsType) {
      const r = await syncHealthProgramItem(supabase, horseId, cogginsType.id, payload.coggins.date_drawn, coggins.expiry_date)
      if (r.error) throw new Error(r.error)
    }
  }

  // 3. Health events (unlikely from Coggins PDF, but supported)
  if (payload.health_events.length > 0) {
    const { data: types } = await supabase
      .from('health_item_type')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null)

    const typeMap = new Map(types?.map(t => [t.name.toLowerCase(), t.id]) ?? [])

    for (const event of payload.health_events) {
      const typeId = typeMap.get(event.item_name.toLowerCase())
        ?? (await getOrCreateHealthItemType(supabase, event.item_name))

      const { error: heError } = await supabase
        .from('health_event')
        .insert({
          horse_id:            horseId,
          health_item_type_id: typeId,
          item_name:           event.item_name,
          administered_on:     event.administered_on,
          next_due:            event.next_due,
          administered_by:     event.administered_by,
          lot_number:          event.lot_number,
          result:              event.result,
        })

      if (heError) throw heError

      const r = await syncHealthProgramItem(supabase, horseId, typeId, event.administered_on, event.next_due)
      if (r.error) throw new Error(r.error)
    }
  }

  redirect(`/chia/herd/horses/${horseId}`)
}

// ── Coggins / New Horse import (legacy — kept for reference) ──

type CogginsImportPayload = {
  horse: {
    barn_name:       string | null
    registered_name: string | null
    breed:           string | null
    gender:          string | null
    color:           string | null
    date_of_birth:   string | null
    microchip:       string | null
  }
  coggins: {
    date_drawn:         string | null
    vet_name:           string | null
    form_serial_number: string | null
  }
  health_events: {
    item_name:       string
    administered_on: string
    next_due:        string | null
    administered_by: string | null
    lot_number:      string | null
    result:          string | null
  }[]
  // Storage path + filename after client-side upload
  document: {
    storagePath: string
    filename:    string
    uploadedAt:  string
  }
}

export async function importCoggins(payload: CogginsImportPayload) {
  const supabase = createAdminClient()

  // 1. Create horse record (pending status)
  const { data: horse, error: horseError } = await supabase
    .from('horse')
    .insert({
      barn_name:       payload.horse.barn_name ?? 'Unknown',
      registered_name: payload.horse.registered_name,
      breed:           payload.horse.breed,
      gender:          payload.horse.gender,
      color:           payload.horse.color,
      date_of_birth:   payload.horse.date_of_birth,
      microchip:       payload.horse.microchip,
      status:          'pending',
    })
    .select('id')
    .single()

  if (horseError) throw horseError

  // 2. Create document record for the uploaded PDF
  const { data: doc, error: docError } = await supabase
    .from('document')
    .insert({
      horse_id:      horse.id,
      document_type: 'Coggins',
      file_url:      payload.document.storagePath,
      filename:      payload.document.filename,
      uploaded_at:   payload.document.uploadedAt,
    })
    .select('id')
    .single()

  if (docError) throw docError

  // 3. Create Coggins record linked to the document, then sync health_program_item
  if (payload.coggins.date_drawn) {
    const { data: coggins, error: cogginsError } = await supabase
      .from('coggins')
      .insert({
        horse_id:           horse.id,
        date_drawn:         payload.coggins.date_drawn,
        vet_name:           payload.coggins.vet_name,
        form_serial_number: payload.coggins.form_serial_number,
        document_id:        doc.id,
      })
      .select('expiry_date')
      .single()

    if (cogginsError) throw cogginsError

    // Sync the Coggins health_program_item so it appears in the herd health grid
    const { data: cogginsType } = await supabase
      .from('health_item_type')
      .select('id')
      .eq('name', 'Coggins')
      .is('deleted_at', null)
      .maybeSingle()

    if (cogginsType) {
      const r = await syncHealthProgramItem(supabase, horse.id, cogginsType.id, payload.coggins.date_drawn, coggins.expiry_date)
      if (r.error) throw new Error(r.error)
    }
  }

  // 4. Look up health item types for matching
  if (payload.health_events.length > 0) {
    const { data: types } = await supabase
      .from('health_item_type')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null)

    const typeMap = new Map(types?.map(t => [t.name.toLowerCase(), t.id]) ?? [])

    for (const event of payload.health_events) {
      const typeId = typeMap.get(event.item_name.toLowerCase())
        ?? (await getOrCreateHealthItemType(supabase, event.item_name))

      const { error: heError } = await supabase
        .from('health_event')
        .insert({
          horse_id:            horse.id,
          health_item_type_id: typeId,
          item_name:           event.item_name,
          administered_on:     event.administered_on,
          next_due:            event.next_due,
          administered_by:     event.administered_by,
          lot_number:          event.lot_number,
          result:              event.result,
        })

      if (heError) throw heError

      const r = await syncHealthProgramItem(supabase, horse.id, typeId, event.administered_on, event.next_due)
      if (r.error) throw new Error(r.error)
    }
  }

  redirect(`/chia/herd/horses/${horse.id}`)
}

// ── Add Vet Record ────────────────────────────────────────────

type AddVetRecordPayload = {
  visit: {
    visit_date:      string
    vet_name:        string | null
    findings:        string | null
    recommendations: string | null
  }
  health_events: {
    catalog_match:   string | null
    item_name:       string
    administered_on: string
    next_due:        string | null
    result:          string | null
    lot_number:      string | null
    // Set by the Review UI's per-event picker. A UUID means "link to
    // this existing health_item_type — do not create a new one".
    // null means "no existing match selected — create a new type
    // from item_name". Must be explicit from the client now so the
    // admin's in-UI reassignment isn't overridden by stale fuzzy
    // matching on the server.
    health_item_type_id?: string | null
  }[]
  care_plans: {
    content:      string
    starts_on:    string | null
    ends_on:      string | null
    source_quote: string | null
  }[]
  document: {
    storagePath: string
    filename:    string
    uploadedAt:  string
  } | null
}

export async function addVetRecord(horseId: string, payload: AddVetRecordPayload) {
  const user    = await getCurrentUser()
  const supabase = createAdminClient()

  // 1. Create document record if PDF was uploaded
  let documentId: string | null = null
  if (payload.document) {
    const { data: doc, error: docError } = await supabase
      .from('document')
      .insert({
        horse_id:      horseId,
        document_type: 'Vet Record',
        file_url:      payload.document.storagePath,
        filename:      payload.document.filename,
        uploaded_at:   payload.document.uploadedAt,
      })
      .select('id')
      .single()
    if (docError) throw docError
    documentId = doc.id
  }

  // 2. Create vet_visit record
  const { data: vetVisit, error: visitError } = await supabase
    .from('vet_visit')
    .insert({
      horse_id:                  horseId,
      visit_date:                payload.visit.visit_date,
      vet_name:                  payload.visit.vet_name,
      findings:                  payload.visit.findings,
      recommendations:           payload.visit.recommendations,
      imported_from_document_id: documentId,
      created_by:                user?.personId ?? null,
    })
    .select('id')
    .single()
  if (visitError) throw visitError

  // 3. Create temporary care plans linked to this visit
  for (const cp of payload.care_plans) {
    const { error } = await supabase
      .from('care_plan')
      .insert({
        horse_id:            horseId,
        content:             cp.content,
        starts_on:           cp.starts_on,
        ends_on:             cp.ends_on,
        source_quote:        cp.source_quote,
        source_vet_visit_id: vetVisit.id,
        created_by:          user?.personId ?? null,
        is_active:           true,
        version:             1,
      })
    if (error) throw error
  }

  // 4. Create health events + upsert health program items
  if (payload.health_events.length > 0) {
    for (const event of payload.health_events) {
      // Trust the client's explicit choice from the Review UI:
      // - UUID  → link to that existing type, never create a new one
      // - null  → no match selected; create a new type from item_name
      // No fuzzy fallback — the Review screen's picker is the source of
      // truth for match vs. create. (Earlier version tried to re-match by
      // name here and that's how combo strings like "EEE/WEE/Tetanus"
      // silently created dup types even when the admin had picked an
      // existing catalog entry.)
      const typeId = event.health_item_type_id
        ?? (await getOrCreateHealthItemType(supabase, event.item_name))

      const { error: heError } = await supabase
        .from('health_event')
        .insert({
          horse_id:            horseId,
          health_item_type_id: typeId,
          item_name:           event.item_name,
          administered_on:     event.administered_on,
          next_due:            event.next_due,
          result:              event.result,
          lot_number:          event.lot_number,
          source_vet_visit_id: vetVisit.id,
          recorded_by:         user?.personId ?? null,
        })
      if (heError) throw heError

      // Use syncHealthProgramItem rather than supabase.upsert — the unique
      // index on (horse_id, health_item_type_id) is partial, which the JS
      // client can't generate a valid ON CONFLICT for. See the helper's
      // docstring for the full story; this bug was silently dropping
      // health_program_item rows so imported vet records never appeared
      // on the herd grid.
      const { error: syncErr } = await syncHealthProgramItem(
        supabase,
        horseId,
        typeId,
        event.administered_on,
        event.next_due,
      )
      if (syncErr) throw new Error(`health_program_item sync failed: ${syncErr}`)
    }
  }

  redirect(`/chia/herd/horses/${horseId}`)
}

/**
 * Upsert a health_program_item for (horse, type) — "sync the schedule row".
 *
 * Why not supabase.upsert(): the unique index on (horse_id, health_item_type_id)
 * is PARTIAL (`WHERE deleted_at IS NULL`). Postgres rejects `ON CONFLICT (cols)`
 * against a partial index because the planner can't prove the predicate holds,
 * and the Supabase JS client doesn't expose the `WHERE` clause needed to make
 * it work. Without this helper every upsert call silently fails with
 * `42P10: there is no unique or exclusion constraint matching the ON CONFLICT
 * specification` — which is exactly what bit the vet-record importer: events
 * wrote fine, but no health_program_item rows appeared on the herd grid.
 *
 * Manual select → update / insert sidesteps the issue and keeps the partial
 * index (which we want, so soft-deleted rows don't block re-creation).
 */
async function syncHealthProgramItem(
  supabase: ReturnType<typeof createAdminClient>,
  horseId: string,
  typeId: string,
  lastDone: string,
  nextDue: string | null,
): Promise<{ error?: string }> {
  const { data: existing, error: selErr } = await supabase
    .from('health_program_item')
    .select('id')
    .eq('horse_id', horseId)
    .eq('health_item_type_id', typeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (selErr) return { error: selErr.message }

  if (existing) {
    // Only update if this record is more recent — prevents an older import
    // (e.g. a vet record containing a past Coggins) from overwriting a newer
    // one that was imported first.
    const { data: cur } = await supabase
      .from('health_program_item')
      .select('next_due, last_done')
      .eq('id', existing.id)
      .maybeSingle()

    const incomingIsNewer =
      !cur ||
      (nextDue ?? '') > (cur.next_due ?? '') ||
      (nextDue === cur.next_due && lastDone > (cur.last_done ?? ''))

    if (!incomingIsNewer) return {}

    const { error } = await supabase
      .from('health_program_item')
      .update({ last_done: lastDone, next_due: nextDue, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: error.message }
    return {}
  }

  const { error } = await supabase
    .from('health_program_item')
    .insert({
      horse_id:            horseId,
      health_item_type_id: typeId,
      last_done:           lastDone,
      next_due:            nextDue,
    })
  if (error) return { error: error.message }
  return {}
}

async function getOrCreateHealthItemType(
  supabase: ReturnType<typeof createAdminClient>,
  name: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('health_item_type')
    .select('id')
    .ilike('name', name)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) return existing.id

  // Auto-created types stay hidden from the herd dashboard grid by
  // default. The grid is a curated view of recurring health items the
  // admin wants to track at a barn level; AI-coined one-offs (one-time
  // treatments, unusual diagnostics) shouldn't clutter it automatically.
  // Admin can promote them from Manage Health Items if they belong.
  const { data, error } = await supabase
    .from('health_item_type')
    .insert({ name, is_essential: false, show_in_herd_dashboard: false, sort_order: 99 })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
