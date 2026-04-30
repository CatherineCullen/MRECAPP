'use client'

import { useEffect, useState, useTransition } from 'react'
import { savePushSubscription, revokePushSubscription } from '../push-actions'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

type State =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'subscribed' }
  | { status: 'unsubscribed' }
  | { status: 'loading' }

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64     = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(b64)
  const arr     = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/**
 * One-tap push enable for the current device. Walks the user through:
 *   1. Browser permission prompt (Notification.requestPermission)
 *   2. Subscribe via the SW's pushManager
 *   3. Persist the subscription to push_subscription
 *
 * iOS only fires push from a home-screen-installed PWA — see install
 * prompt for the add-to-home flow.
 */
export default function PushNotificationToggle() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState({ status: 'unsupported' })
      return
    }
    if (Notification.permission === 'denied') {
      setState({ status: 'denied' })
      return
    }
    navigator.serviceWorker.ready.then(async reg => {
      const existing = await reg.pushManager.getSubscription()
      setState({ status: existing ? 'subscribed' : 'unsubscribed' })
    })
  }, [])

  async function enable() {
    setError(null)
    if (!VAPID_PUBLIC) {
      setError('Push not configured. Contact the barn.')
      return
    }
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState({ status: 'denied' })
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        // The Web API expects BufferSource. Uint8Array is a BufferSource
        // at runtime, but Node's lib.dom types narrow buffer to
        // ArrayBuffer; cast to BufferSource to satisfy the check.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
      })
      const json = sub.toJSON()
      start(async () => {
        const res = await savePushSubscription({
          endpoint:  sub.endpoint,
          p256dh:    json.keys?.p256dh ?? '',
          auth:      json.keys?.auth ?? '',
          userAgent: navigator.userAgent,
        })
        if (res.error) { setError(res.error); return }
        setState({ status: 'subscribed' })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable notifications.')
    }
  }

  async function disable() {
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        start(async () => {
          await revokePushSubscription(endpoint)
          setState({ status: 'unsubscribed' })
        })
      } else {
        setState({ status: 'unsubscribed' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable notifications.')
    }
  }

  if (state.status === 'loading') return null

  if (state.status === 'unsupported') {
    return (
      <p className="text-xs text-on-surface-muted">
        This browser doesn't support push notifications. SMS still works.
      </p>
    )
  }

  if (state.status === 'denied') {
    return (
      <p className="text-xs text-on-surface-muted">
        Push notifications are blocked. Enable them in your browser's site settings to use them here.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={state.status === 'subscribed' ? disable : enable}
        disabled={pending}
        className={`text-xs font-semibold px-3 py-1.5 rounded ${
          state.status === 'subscribed'
            ? 'bg-surface-highest text-on-surface hover:bg-surface-low'
            : 'btn-primary text-white'
        } disabled:opacity-50`}
      >
        {pending ? 'Saving…' : state.status === 'subscribed' ? 'Push enabled — turn off on this device' : 'Enable push notifications on this device'}
      </button>
      {error && <p className="text-xs text-error">{error}</p>}
      <p className="text-[10px] text-on-surface-muted">
        Per-device. Enable on each phone or computer separately.
      </p>
    </div>
  )
}
