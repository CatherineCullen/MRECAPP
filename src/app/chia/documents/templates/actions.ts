'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// Admin edits the waiver / boarding agreement text. Every save creates a
// NEW immutable version (increments the version number by 1). Old versions
// stay queryable and any waiver already signed against v1 remains pinned to
// v1 even after v2 is authored — see document.template_version_id.

export async function saveTemplateVersion(args: {
  kind:         'waiver' | 'boarding_agreement'
  bodyMarkdown: string
}): Promise<{ error?: string; version?: number }> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: 'Admin only.' }
  if (!args.bodyMarkdown.trim()) return { error: 'Body cannot be empty.' }

  const db = createAdminClient()

  const { data: latest } = await db
    .from('document_template')
    .select('version')
    .eq('kind', args.kind)
    .is('deleted_at', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  const { error } = await db.from('document_template').insert({
    kind:          args.kind,
    version:       nextVersion,
    body_markdown: args.bodyMarkdown,
    created_by:    user.personId ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath(`/chia/documents/templates/${args.kind === 'waiver' ? 'waiver' : 'boarding-agreement'}`)
  return { version: nextVersion }
}
