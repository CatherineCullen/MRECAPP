'use client'

import { useState, useTransition, useRef } from 'react'
import { addEventType } from '../actions'

export default function AddEventTypeForm() {
  const [open, setOpen]               = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [pending, startTransition]    = useTransition()
  const formRef                       = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formRef.current) return
    const data = new FormData(formRef.current)
    setError(null)
    startTransition(async () => {
      const result = await addEventType(data)
      if (result.error) {
        setError(result.error)
      } else {
        formRef.current?.reset()
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-[#002058] hover:underline mt-2"
      >
        + Add event type
      </button>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-3 border border-[#c4c6d1]/50 rounded-lg p-4 bg-white space-y-3">
      <div className="text-xs font-bold text-[#191c1e] uppercase tracking-wide">New Event Type</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#444650] mb-1">Label <span className="text-[#8a1a1a]">*</span></label>
          <input
            name="label"
            required
            placeholder="e.g. Barn Tour"
            className="w-full text-sm border border-[#c4c6d1]/60 rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] bg-white text-[#191c1e]"
          />
        </div>
        <div>
          <label className="block text-xs text-[#444650] mb-1">Duration (minutes) <span className="text-[#8a1a1a]">*</span></label>
          <input
            name="duration_minutes"
            type="number"
            required
            min="1"
            placeholder="60"
            className="w-full text-sm border border-[#c4c6d1]/60 rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] bg-white text-[#191c1e]"
          />
        </div>
        <div>
          <label className="block text-xs text-[#444650] mb-1">Default Price</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[#444650]">$</span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              placeholder="optional"
              className="w-full text-sm border border-[#c4c6d1]/60 rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] bg-white text-[#191c1e]"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[#444650] mb-1">Calendar Badge <span className="text-[#8c8e98]">(1–4 chars)</span></label>
          <input
            name="calendar_badge"
            maxLength={4}
            placeholder="e.g. TOUR"
            className="w-full text-sm border border-[#c4c6d1]/60 rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] bg-white text-[#191c1e] uppercase"
          />
        </div>
        <div>
          <label className="block text-xs text-[#444650] mb-1">Calendar Color <span className="text-[#8c8e98]">(hex)</span></label>
          <input
            name="calendar_color"
            placeholder="#e89c3a"
            pattern="^#[0-9a-fA-F]{6}$"
            className="w-full text-sm border border-[#c4c6d1]/60 rounded px-2 py-1.5 focus:outline-none focus:border-[#002058] bg-white text-[#191c1e]"
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#8a1a1a]">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="text-xs font-semibold bg-[#002058] text-white rounded px-3 py-1.5 hover:bg-[#002058]/90 disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add Event Type'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={pending}
          className="text-xs text-[#444650] hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
