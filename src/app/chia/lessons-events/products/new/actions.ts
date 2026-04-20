'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Unified entry point for one-off lesson creation + makeup-token redemption.
 *
 * All kinds create exactly one lesson row. The difference is what backs the
 * lesson_rider row:
 *   • evaluation / extra_lesson / birthday_party / event / other
 *       → a new lesson_package; lesson_rider.package_id = that package
 *   • makeup
 *       → no package; lesson_rider.subscription_id = token.subscription_id,
 *         lesson.is_makeup = true, token flips to 'scheduled'
 *
 * For makeup we DON'T also write a package — the subscription already
 * billed for this lesson quota. Pricing for make-ups is implicit.
 */

// Birthday parties, clinics, equine therapy, and "other" non-lesson-shaped
// products are now modeled as Events (see event / event_type tables). This
// form only creates lesson-shaped products that inherit lesson_type
// (private/semi/group), makeup tokens, and cancellation semantics.
export type ProductKind =
  | 'evaluation'
  | 'extra_lesson'
  | 'makeup'

const PRODUCT_TYPE_LABEL: Record<Exclude<ProductKind, 'makeup'>, string> = {
  evaluation:   'Evaluation',
  extra_lesson: 'Extra Lesson',
}

export type CreateLessonProductArgs = {
  kind:         ProductKind
  tokenId?:     string | null          // required when kind === 'makeup'
  riderId:      string
  billedToId?:  string | null          // required for non-makeup kinds
  instructorId: string
  horseId:      string | null
  scheduledAt:  string                 // 'YYYY-MM-DDTHH:MM:00' (naive wall-clock)
  lessonType:   'private' | 'semi_private' | 'group'
  price:        number                 // package price; ignored for makeup
  partySize:    number | null          // birthday_party only
  notes:        string | null
}

export async function createLessonProduct(
  args: CreateLessonProductArgs,
): Promise<{ error?: string; lessonId?: string; packageId?: string }> {
  const user     = await getCurrentUser()
  const supabase = createAdminClient()

  // --- Validate ------------------------------------------------------------
  if (!args.riderId)      return { error: 'Rider is required.' }
  if (!args.instructorId) return { error: 'Instructor is required.' }
  if (!args.scheduledAt)  return { error: 'Date and time are required.' }

  // --- Makeup redemption branch --------------------------------------------
  if (args.kind === 'makeup') {
    if (!args.tokenId) return { error: 'Missing makeup token.' }

    // Load + validate the token
    const { data: token, error: tokErr } = await supabase
      .from('makeup_token')
      .select('id, status, rider_id, subscription_id, original_lesson_id')
      .eq('id', args.tokenId)
      .maybeSingle()

    if (tokErr)        return { error: tokErr.message }
    if (!token)        return { error: 'Makeup token not found.' }
    if (token.status !== 'available') {
      return { error: `Token is ${token.status}, not available for scheduling.` }
    }
    if (token.rider_id !== args.riderId) {
      return { error: 'Token rider does not match the rider on this lesson.' }
    }
    if (!token.subscription_id) {
      // lesson_rider requires exactly one of subscription_id OR package_id.
      // Admin-grant tokens that weren't tied to a subscription can't flow
      // through this path without a schema relaxation — surface cleanly.
      return { error: 'This token is not linked to a subscription. Use a one-off lesson product instead.' }
    }

    // 1) Create the lesson (is_makeup = true, makeup_for_lesson_id set)
    const { data: lesson, error: lessonErr } = await supabase
      .from('lesson')
      .insert({
        instructor_id:        args.instructorId,
        lesson_type:          args.lessonType,
        scheduled_at:         args.scheduledAt,
        status:               'scheduled' as const,
        is_makeup:            true,
        makeup_for_lesson_id: token.original_lesson_id,
        notes:                args.notes,
        created_by:           user?.personId ?? null,
      })
      .select('id')
      .single()

    if (lessonErr || !lesson) {
      return { error: lessonErr?.message ?? 'Failed to create lesson.' }
    }

    // 2) Create the lesson_rider, linked to the original subscription + token
    const { error: riderErr } = await supabase
      .from('lesson_rider')
      .insert({
        lesson_id:       lesson.id,
        rider_id:        args.riderId,
        horse_id:        args.horseId,
        subscription_id: token.subscription_id,
        makeup_token_id: token.id,
      })

    if (riderErr) {
      await supabase.from('lesson').delete().eq('id', lesson.id)
      return { error: riderErr.message }
    }

    // 3) Flip the token
    const { error: tokUpdErr } = await supabase
      .from('makeup_token')
      .update({
        status:              'scheduled',
        scheduled_lesson_id: lesson.id,
        status_changed_at:   new Date().toISOString(),
      })
      .eq('id', token.id)

    if (tokUpdErr) {
      await supabase.from('lesson_rider').delete().eq('lesson_id', lesson.id)
      await supabase.from('lesson').delete().eq('id', lesson.id)
      return { error: tokUpdErr.message }
    }

    revalidatePath('/chia/lessons-events')
    revalidatePath('/chia/lessons-events/tokens')
    return { lessonId: lesson.id }
  }

  // --- One-off lesson product branch --------------------------------------
  if (!args.billedToId) return { error: 'Billed-to is required.' }
  if (!Number.isFinite(args.price) || args.price < 0) {
    return { error: 'Price must be a non-negative number.' }
  }
  // Disallow $0 packages — they clutter the Unbilled Products list and
  // indicate the admin forgot to set a price. If a legit free product ever
  // comes up we can revisit, but the current workflow has none.
  if (args.price === 0) {
    return { error: 'Price cannot be $0. Set a real price or delete the product if it is free.' }
  }

  // 1) Create the lesson_package
  const productType = PRODUCT_TYPE_LABEL[args.kind]
  // partySize is still on the args type (null for lesson-shaped kinds post-
  // migration) but we no longer fold it into package notes — it only ever
  // applied to birthday parties, which are now events.
  const packageNotes = args.notes || null

  const { data: pkg, error: pkgErr } = await supabase
    .from('lesson_package')
    .insert({
      person_id:        args.riderId,
      billed_to_id:     args.billedToId,
      product_type:     productType,
      package_size:     1,
      package_price:    args.price,
      purchased_at:     new Date().toISOString().slice(0, 10),
      default_horse_id: args.horseId,
      notes:            packageNotes,
      created_by:       user?.personId ?? null,
    })
    .select('id')
    .single()

  if (pkgErr || !pkg) {
    return { error: pkgErr?.message ?? 'Failed to create lesson product.' }
  }

  // 2) Create the lesson
  const { data: lesson, error: lessonErr } = await supabase
    .from('lesson')
    .insert({
      instructor_id: args.instructorId,
      lesson_type:   args.lessonType,
      scheduled_at:  args.scheduledAt,
      status:        'scheduled' as const,
      notes:         args.notes,
      created_by:    user?.personId ?? null,
    })
    .select('id')
    .single()

  if (lessonErr || !lesson) {
    await supabase.from('lesson_package').delete().eq('id', pkg.id)
    return { error: lessonErr?.message ?? 'Failed to create lesson.' }
  }

  // 3) Create the lesson_rider
  const { error: riderErr } = await supabase
    .from('lesson_rider')
    .insert({
      lesson_id:  lesson.id,
      rider_id:   args.riderId,
      horse_id:   args.horseId,
      package_id: pkg.id,
    })

  if (riderErr) {
    await supabase.from('lesson').delete().eq('id', lesson.id)
    await supabase.from('lesson_package').delete().eq('id', pkg.id)
    return { error: riderErr.message }
  }

  // 4) Ensure the rider has the 'rider' role (same pattern as subscription create)
  const { data: existingRole } = await supabase
    .from('person_role')
    .select('id, deleted_at')
    .eq('person_id', args.riderId)
    .eq('role', 'rider' as any)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existingRole) {
    await supabase
      .from('person_role')
      .insert({ person_id: args.riderId, role: 'rider' as any })
  } else if (existingRole.deleted_at) {
    await supabase
      .from('person_role')
      .update({ deleted_at: null, assigned_at: new Date().toISOString() })
      .eq('id', existingRole.id)
  }

  revalidatePath('/chia/lessons-events')
  return { lessonId: lesson.id, packageId: pkg.id }
}
