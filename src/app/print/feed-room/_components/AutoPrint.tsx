'use client'

import { useEffect } from 'react'

/**
 * Fires window.print() once on mount. The user can dismiss the print
 * dialog and use the screen view as a preview, or hit Ctrl+P again
 * later from the same tab.
 */
export default function AutoPrint() {
  useEffect(() => {
    // Small delay so the page paints + fonts settle before the print
    // dialog opens. Skip in test environments (no window.print).
    if (typeof window === 'undefined' || !window.print) return
    const t = setTimeout(() => window.print(), 200)
    return () => clearTimeout(t)
  }, [])
  return null
}
