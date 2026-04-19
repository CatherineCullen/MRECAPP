'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTemplateVersion } from '../../actions'
import ReactMarkdown from 'react-markdown'

export default function TemplateEditor({
  kind, initialBody, currentVersion,
}: {
  kind: 'waiver' | 'boarding_agreement'
  initialBody: string
  currentVersion: number | null
}) {
  const router = useRouter()
  const [body, setBody] = useState(initialBody)
  const [showPreview, setShowPreview] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  function handleSave() {
    setError(null); setOk(null)
    if (body === initialBody) { setError('No changes to save.'); return }
    startTransition(async () => {
      const res = await saveTemplateVersion({ kind, bodyMarkdown: body })
      if (res.error) { setError(res.error); return }
      setOk(`Saved as v${res.version}.`)
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#f2f4f7] flex items-center justify-between">
        <div className="text-xs text-[#444650]">
          {currentVersion ? <>Current: v{currentVersion}</> : <>No version yet — creating v1</>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(s => !s)}
            className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="px-4 py-4 prose prose-sm max-w-none text-[#191c1e]">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          className="w-full p-3 text-xs font-mono border-0 focus:outline-none"
          rows={28}
          placeholder="# Waiver text in markdown…"
        />
      )}

      <div className="px-4 py-3 border-t border-[#c4c6d1]/30 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || body === initialBody}
          className="btn-primary text-white text-xs font-semibold px-4 py-2 rounded disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save as new version'}
        </button>
        {error && <span className="text-xs text-[#b3261e]">{error}</span>}
        {ok    && <span className="text-xs text-[#1a6b3c]">{ok}</span>}
      </div>
    </div>
  )
}
