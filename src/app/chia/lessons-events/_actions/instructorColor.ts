'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { INSTRUCTOR_PALETTE } from '../_lib/instructorColor'

// Accept any hex in the preset palette, OR null (reset to hash default).
// Keeping this tight in v1 — free-form hex can come later if needed.
const ALLOWED = new Set<string>(INSTRUCTOR_PALETTE)

export async function updateInstructorColor(args: {
  instructorId: string
  color:        string | null   // null resets to the hash-based default
}): Promise<{ error?: string }> {
  if (!args.instructorId) return { error: 'Missing instructor.' }

  if (args.color !== null) {
    // Guardrail: palette-only for now. The DB CHECK allows any 6-digit hex,
    // but the UI should never submit outside the palette.
    if (!ALLOWED.has(args.color)) {
      return { error: 'Color not in palette.' }
    }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('person')
    .update({
      calendar_color: args.color,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', args.instructorId)

  if (error) return { error: error.message }

  // Calendar + subscriptions both surface the color; lesson detail too. Refresh
  // liberally — these are inexpensive RSC renders.
  revalidatePath('/chia/lessons-events')
  revalidatePath('/chia/lessons-events/subscriptions')
  return {}
}
