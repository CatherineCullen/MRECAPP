'use client'

import { useState } from 'react'
import { formatSheetAsText, type SheetTextSheet } from '../../_lib/sheetText'

export default function CopyAsTextButton({ sheet }: { sheet: SheetTextSheet }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const text = formatSheetAsText(sheet)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Older browsers / no clipboard permission. Fall back to a prompt the
      // user can manually copy from.
      window.prompt('Copy this:', text)
    }
  }

  return (
    <button
      onClick={copy}
      className="text-xs font-semibold text-[#056380] hover:underline"
    >
      {copied ? 'Copied!' : 'Copy as text'}
    </button>
  )
}
