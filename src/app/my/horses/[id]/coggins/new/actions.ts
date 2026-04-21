'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRiderScope } from '../../../../_lib/riderScope'

type Payload = {
  date_drawn:         string
  vet_name:           string | null
  form_serial_number: string | null
  document: {
    storagePath: string
    filename:    string
    uploadedAt:  string
  }
}

export async function addMyCoggins(horseId: string, payload: Payload) {
  const user = await getCurrentUser()
  if (!user?.personId) throw new Error('Not signed in')

  const supabase = createAdminClient()

  const riderIds = await getRiderScope(user.personId)
  const { data: connection } = await supabase
    .from('horse_contact')
    .select('id')
    .eq('horse_id', horseId)
    .in('person_id', riderIds)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!connection && !user.isAdmin) throw new Error('Not authorized')

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

  const { data: coggins, error: cogginsError } = await supabase
    .from('coggins')
    .insert({
      horse_id:           horseId,
      date_drawn:         payload.date_drawn,
      vet_name:           payload.vet_name,
      form_serial_number: payload.form_serial_number,
      document_id:        doc.id,
    })
    .select('expiry_date')
    .single()
  if (cogginsError) throw cogginsError

  // Keep the herd health grid in sync: find or create the Coggins
  // health_program_item row. Partial unique index requires manual select →
  // update / insert, not .upsert() (see CHIA import actions docstring).
  const { data: cogginsType } = await supabase
    .from('health_item_type')
    .select('id')
    .eq('name', 'Coggins')
    .is('deleted_at', null)
    .maybeSingle()

  if (cogginsType) {
    const { data: existing } = await supabase
      .from('health_program_item')
      .select('id, next_due, last_done')
      .eq('horse_id', horseId)
      .eq('health_item_type_id', cogginsType.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      const incomingIsNewer =
        (coggins.expiry_date ?? '') > (existing.next_due ?? '') ||
        (coggins.expiry_date === existing.next_due && payload.date_drawn > (existing.last_done ?? ''))
      if (incomingIsNewer) {
        await supabase
          .from('health_program_item')
          .update({
            last_done:  payload.date_drawn,
            next_due:   coggins.expiry_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      }
    } else {
      await supabase
        .from('health_program_item')
        .insert({
          horse_id:            horseId,
          health_item_type_id: cogginsType.id,
          last_done:           payload.date_drawn,
          next_due:            coggins.expiry_date,
        })
    }
  }

  redirect(`/my/horses/${horseId}`)
}
