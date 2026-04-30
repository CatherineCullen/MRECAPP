'use client'

import { useEffect } from 'react'
import { adminMarkThreadRead } from '../actions'

/**
 * Fire markRead on mount, but ONLY if admin is already a participant in
 * the thread. If they haven't posted yet, there's no thread_participant
 * row to update — and we don't want to silently join the thread just by
 * reading it (joining happens explicitly when admin posts).
 */
export default function AdminMarkReadOnMount({
  threadId,
  adminIsParticipant,
}: {
  threadId: string
  adminIsParticipant: boolean
}) {
  useEffect(() => {
    if (adminIsParticipant) void adminMarkThreadRead(threadId)
  }, [threadId, adminIsParticipant])
  return null
}
