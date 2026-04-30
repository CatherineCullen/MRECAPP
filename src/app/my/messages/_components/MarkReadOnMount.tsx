'use client'

import { useEffect } from 'react'
import { markThreadReadAction } from '../actions'

/**
 * Fires markThreadReadAction once when the thread view mounts. Tiny —
 * no spinner, no error state. If it fails, the user just keeps seeing
 * the unread state until they navigate again.
 */
export default function MarkReadOnMount({ threadId }: { threadId: string }) {
  useEffect(() => {
    void markThreadReadAction(threadId)
  }, [threadId])
  return null
}
