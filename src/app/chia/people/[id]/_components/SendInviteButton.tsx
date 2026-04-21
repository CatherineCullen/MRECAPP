'use client'

import { useState, useTransition } from 'react'
import { sendInviteToExistingPerson } from '../actions'

export default function SendInviteButton({
  personId,
  hasEmail,
}: {
  personId: string
  hasEmail: boolean
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ link?: string; error?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function handleClick() {
    start(async () => {
      const res = await sendInviteToExistingPerson(personId)
      setResult(res)
    })
  }

  function copyLink() {
    if (!result?.link) return
    navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (result?.link) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-700">
          {hasEmail ? 'Invite sent.' : 'Invite created.'}
        </span>
        <button
          onClick={copyLink}
          className="text-xs text-[#056380] hover:text-[#002058] font-medium"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    )
  }

  if (result?.error) {
    return <span className="text-xs text-red-600">{result.error}</span>
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title={hasEmail ? 'Send enrollment invite by email' : 'No email on file — link will be generated for manual delivery'}
      className="text-xs font-semibold text-[#056380] hover:text-[#002058] disabled:opacity-40"
    >
      {pending ? 'Sending…' : 'Send Invite'}
    </button>
  )
}
