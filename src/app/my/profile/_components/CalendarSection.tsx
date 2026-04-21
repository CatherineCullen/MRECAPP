'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rotateIcalToken } from '../actions'

export default function CalendarSection({
  icalToken,
  origin,
}: {
  icalToken: string | null
  origin:    string
}) {
  const router = useRouter()
  const [visible, setVisible] = useState(!!icalToken)
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  const feedPath = icalToken ? `/api/ical/${icalToken}/lessons.ics` : null
  const httpsUrl = feedPath ? `${origin}${feedPath}` : null
  const webcalUrl = httpsUrl ? httpsUrl.replace(/^https?:/, 'webcal:') : null
  const googleUrl = webcalUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`
    : null

  function handleShow() {
    start(async () => {
      const r = await rotateIcalToken()
      if (r.token) setVisible(true)
      router.refresh()
    })
  }

  function handleReset() {
    if (!confirm('Reset the calendar link? Any calendar app currently using the old link will stop updating until you re-add the new one.')) return
    start(async () => {
      await rotateIcalToken()
      setCopied(false)
      router.refresh()
    })
  }

  async function handleCopy() {
    if (!httpsUrl) return
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — user can still long-press the URL field.
    }
  }

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-2">
        Calendar
      </h2>

      {!visible || !httpsUrl ? (
        <div>
          <p className="text-sm text-on-surface">
            Subscribe to your lesson and training ride schedule in Google Calendar, Apple Calendar, or any calendar app.
          </p>
          <p className="text-xs text-on-surface-muted mt-1">
            Read-only. To cancel or reschedule, use this app.
          </p>
          <button
            type="button"
            onClick={handleShow}
            disabled={pending}
            className="mt-3 text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded disabled:opacity-60"
          >
            {pending ? 'Setting up…' : 'Set up calendar'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-on-surface-muted">
            Read-only. To cancel or reschedule, use this app. Google Calendar may take up to 24 hours to show changes; Apple Calendar usually updates within an hour.
          </p>

          <div className="flex flex-wrap gap-2">
            {googleUrl && (
              <a
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded"
              >
                Add to Google Calendar
              </a>
            )}
            {webcalUrl && (
              <a
                href={webcalUrl}
                className="text-xs font-semibold bg-primary text-on-primary px-3 py-1.5 rounded"
              >
                Add to Apple Calendar
              </a>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider mb-1">
              Or copy link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={httpsUrl}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 min-w-0 border border-outline rounded px-2 py-1 text-xs text-on-surface bg-surface-lowest"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 text-xs font-semibold text-on-secondary-container"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            disabled={pending}
            className="text-[11px] text-on-surface-muted underline disabled:opacity-60"
          >
            Reset link
          </button>
        </div>
      )}
    </div>
  )
}
