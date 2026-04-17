'use client'

import { useState, useRef, useEffect } from 'react'

export interface SearchPickerOption {
  id:    string
  label: string
}

export default function SearchPicker({
  name,
  options,
  placeholder = 'Search…',
  required,
  initialValue,
  onSelect,
}: {
  name:          string
  options:       SearchPickerOption[]
  placeholder?:  string
  required?:     boolean
  initialValue?: SearchPickerOption | null
  onSelect?:     (option: SearchPickerOption | null) => void
}) {
  const [query,    setQuery]    = useState(initialValue?.label ?? '')
  const [selected, setSelected] = useState<SearchPickerOption | null>(initialValue ?? null)
  const [open,     setOpen]     = useState(false)
  const containerRef            = useRef<HTMLDivElement>(null)

  const filtered = query.length === 0
    ? options
    : options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase())
      )

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(option: SearchPickerOption) {
    setSelected(option)
    setQuery(option.label)
    setOpen(false)
    onSelect?.(option)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setSelected(null)
    setOpen(true)
    onSelect?.(null)
  }

  function handleFocus() {
    setOpen(true)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input carries the selected ID for form submission */}
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        required={required && !selected}
        className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
        autoComplete="off"
      />

      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-[#c4c6d1] rounded shadow-md max-h-56 overflow-y-auto text-sm">
          {filtered.map((option) => (
            <li
              key={option.id}
              onMouseDown={(e) => {
                e.preventDefault() // prevent blur before click registers
                handleSelect(option)
              }}
              className="px-3 py-2 cursor-pointer hover:bg-[#f2f4f7] text-[#191c1e]"
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}

      {open && query.length > 0 && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-[#c4c6d1] rounded shadow-md px-3 py-2 text-sm text-[#444650]">
          No matches
        </div>
      )}
    </div>
  )
}
