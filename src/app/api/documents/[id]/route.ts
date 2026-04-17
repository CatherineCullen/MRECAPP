import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Redirects to a short-lived signed URL for a document in Storage.
// Usage: href="/api/documents/[document-id]"
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: doc, error: docError } = await supabase
    .from('document')
    .select('file_url, filename')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (docError || !doc) {
    return new NextResponse('Document not found', { status: 404 })
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.file_url, 60 * 60) // 1 hour

  if (signError || !signed) {
    return new NextResponse('Could not generate document URL', { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
