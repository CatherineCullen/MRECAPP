'use client'

import { useEffect } from 'react'

/**
 * Registers /sw.js with root scope. Idempotent — the browser handles
 * duplicate registrations as no-ops. Mounted in the /my layout so the
 * SW activates as soon as a user enters the app shell.
 *
 * Push subscription itself is opt-in (per spec), driven by an explicit
 * toggle in profile/messages settings rather than auto-prompting.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => {
        console.warn('[sw] registration failed', err)
      })
  }, [])
  return null
}
