'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMyMessage } from '../actions'

/**
 * Compose box for an existing thread. Knows the recipient (the other
 * pair member, fixed for the life of the thread) and an optional
 * lesson tag passed via search params.
 */
export default function Composer({
  recipientId,
  lessonId,
  recipientLabel,
}: {
  recipientId: string
  lessonId?:   string | null
  recipientLabel: string
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function handleSend() {
    const trimmed = body.trim()
    if (!trimmed) return
    setError(null)
    start(async () => {
      const res = await sendMyMessage({ recipientId, body: trimmed, lessonId })
      if (res.error) { setError(res.error); return }
      setBody('')
      router.refresh()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl-Enter sends; bare Enter inserts newline (lessons + cancellations
    // tend to want multi-line context).
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="bg-surface-low rounded-lg p-3 space-y-2">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message ${recipientLabel}…`}
        rows={2}
        className="w-full bg-surface-highest rounded px-3 py-2 text-sm text-on-surface placeholder-on-surface-muted/60 focus:outline-none resize-none"
      />
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-on-surface-muted">⌘↵ to send</span>
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !body.trim()}
          className="btn-primary text-white text-sm font-semibold px-4 py-1.5 rounded disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
