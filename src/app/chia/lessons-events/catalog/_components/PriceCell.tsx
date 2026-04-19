'use client'

import { useState, useTransition, useRef } from 'react'

type Props = {
  value: number | null
  onSave: (price: number | null) => Promise<{ error?: string }>
}

export default function PriceCell({ value, onSave }: Props) {
  const [editing, setEditing]   = useState(false)
  const [input, setInput]       = useState(value != null ? String(value) : '')
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setInput(value != null ? String(value) : '')
    setError(null)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  function commit() {
    const trimmed = input.trim()
    const price = trimmed === '' ? null : parseFloat(trimmed)
    if (trimmed !== '' && (isNaN(price!) || price! < 0)) {
      setError('Enter a valid dollar amount')
      return
    }
    startTransition(async () => {
      const result = await onSave(price)
      if (result.error) {
        setError(result.error)
      } else {
        setEditing(false)
        setError(null)
      }
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-[#444650]">$</span>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          disabled={pending}
          className="w-24 text-sm border border-[#002058]/40 rounded px-2 py-0.5 focus:outline-none focus:border-[#002058] bg-white text-[#191c1e]"
          autoFocus
        />
        <button
          onClick={commit}
          disabled={pending}
          className="text-xs font-semibold text-[#002058] hover:underline disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={cancel}
          disabled={pending}
          className="text-xs text-[#444650] hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-[#8a1a1a]">{error}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5 text-sm text-left"
    >
      {value != null ? (
        <span className="text-[#191c1e] font-medium group-hover:text-[#002058]">
          ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </span>
      ) : (
        <span className="text-[#8c8e98] italic group-hover:text-[#002058]">Set price</span>
      )}
      <span className="text-[#8c8e98] text-xs opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
    </button>
  )
}
