'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function updateHorse(horseId: string, formData: FormData) {
  const supabase = createAdminClient()

  const barnName       = (formData.get('barn_name') as string).trim()
  const registeredName = (formData.get('registered_name') as string | null)?.trim() || null
  const status         = (formData.get('status') as string) || 'pending'
  const breed          = (formData.get('breed') as string | null)?.trim() || null
  const gender         = (formData.get('gender') as string | null)?.trim() || null
  const color          = (formData.get('color') as string | null)?.trim() || null
  const heightRaw      = formData.get('height') as string | null
  const weightRaw      = formData.get('weight') as string | null
  const dob            = (formData.get('date_of_birth') as string | null) || null
  const microchip      = (formData.get('microchip') as string | null)?.trim() || null
  const lessonHorse    = formData.get('lesson_horse') === 'on'
  const soloTurnout    = formData.get('solo_turnout') === 'on'
  const notes          = (formData.get('notes') as string | null)?.trim() || null
  const turnoutNotes   = (formData.get('turnout_notes') as string | null)?.trim() || null
  const ownershipNotes = (formData.get('ownership_notes') as string | null)?.trim() || null

  const usefId              = (formData.get('usef_id') as string | null)?.trim() || null
  const breedRecordingNumber = (formData.get('breed_recording_number') as string | null)?.trim() || null
  const passportNumber      = (formData.get('passport_number') as string | null)?.trim() || null

  const { error } = await supabase
    .from('horse')
    .update({
      barn_name:        barnName,
      registered_name:  registeredName,
      status:           status as any,
      breed,
      gender,
      color,
      height:           heightRaw ? parseFloat(heightRaw) : null,
      weight:           weightRaw ? parseInt(weightRaw, 10) : null,
      date_of_birth:    dob,
      microchip,
      lesson_horse:     lessonHorse,
      solo_turnout:     soloTurnout,
      notes,
      turnout_notes:    turnoutNotes,
      ownership_notes:  ownershipNotes,
    })
    .eq('id', horseId)

  if (error) throw error

  // Upsert recording IDs if any are provided
  if (usefId || breedRecordingNumber || passportNumber) {
    const { error: ridError } = await supabase
      .from('horse_recording_ids')
      .upsert({
        horse_id:               horseId,
        usef_id:                usefId,
        breed_recording_number: breedRecordingNumber,
        passport_number:        passportNumber,
      }, { onConflict: 'horse_id' })

    if (ridError) throw ridError
  }

  redirect(`/chia/herd/horses/${horseId}`)
}
