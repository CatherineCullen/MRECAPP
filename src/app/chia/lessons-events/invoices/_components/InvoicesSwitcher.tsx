'use client'

import { useState } from 'react'
import LessonDraftsView from './LessonDraftsView'
import LessonSentView from './LessonSentView'
import type { LessonDraftsSnapshot, LessonSentSnapshot } from '../_lib/loadLessonInvoices'

// Sub-nav on the Lessons > Invoices page: Drafts | Sent (matches boarding).
// Default tab is Drafts when any exist, otherwise Sent.

type Props = {
  drafts: LessonDraftsSnapshot
  sent:   LessonSentSnapshot
}

export default function InvoicesSwitcher({ drafts, sent }: Props) {
  const draftCount = drafts.drafts.length
  const sentCount  = sent.groups.reduce((s, g) => s + g.invoices.length, 0)
  const [tab, setTab] = useState<'drafts' | 'sent'>(draftCount > 0 ? 'drafts' : 'sent')

  return (
    <div>
      <div className="flex gap-0 px-6 pt-4 bg-[#f7f9fc] border-b border-[#c4c6d1]/30">
        <button
          onClick={() => setTab('drafts')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'drafts'
              ? 'border-[#002058] text-[#002058]'
              : 'border-transparent text-[#444650] hover:text-[#191c1e]'
          }`}
        >
          Drafts ({draftCount})
        </button>
        <button
          onClick={() => setTab('sent')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'sent'
              ? 'border-[#002058] text-[#002058]'
              : 'border-transparent text-[#444650] hover:text-[#191c1e]'
          }`}
        >
          Sent ({sentCount})
        </button>
      </div>
      {tab === 'drafts' ? <LessonDraftsView snapshot={drafts} /> : <LessonSentView snapshot={sent} />}
    </div>
  )
}
