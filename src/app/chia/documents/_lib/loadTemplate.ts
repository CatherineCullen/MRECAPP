import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type TemplateKind = 'waiver' | 'boarding_agreement'

export type DocumentTemplate = {
  id:             string
  kind:           TemplateKind
  version:        number
  body_markdown:  string
  effective_from: string
  created_at:     string
}

/**
 * Loads the current active (latest by effective_from) template for a given
 * kind. Admin edits create a new row; this always returns the newest.
 * Returns null if no template is seeded yet — caller is responsible for
 * surfacing a useful error message.
 */
export async function loadCurrentTemplate(kind: TemplateKind): Promise<DocumentTemplate | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('document_template')
    .select('id, kind, version, body_markdown, effective_from, created_at')
    .eq('kind', kind)
    .is('deleted_at', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as DocumentTemplate | null
}

/** All versions for admin history view. */
export async function loadTemplateVersions(kind: TemplateKind): Promise<DocumentTemplate[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('document_template')
    .select('id, kind, version, body_markdown, effective_from, created_at')
    .eq('kind', kind)
    .is('deleted_at', null)
    .order('version', { ascending: false })
  return (data ?? []) as DocumentTemplate[]
}
