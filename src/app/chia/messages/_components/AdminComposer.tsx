'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminPostInThread } from '../actions'

export default function AdminComposer({ threadId }: { threadId: string }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function handleSend() {
    const trimmed = body.trim()
    if (!trimmed) return
    setError(null)
    start(async () => {
      const res = await adminPostInThread({ threadId, body: trimmed })
      if (res.error) { setError(res.error); return }
      setBody('')
      router.refresh()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="bg-[#f7f9fc] rounded-lg p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-[#8c8e98] font-semibold">
        Posting as admin · participants will see this with an (admin) tag
      </p>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message…"
        rows={2}
        className="w-full bg-white border border-[#c4c6d1] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#002058] resize-none"
      />
      {error && <p className="text-xs text-[#8f3434]">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#8c8e98]">⌘↵ to send</span>
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !body.trim()}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-[#002058] text-white hover:bg-[#001540] disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
