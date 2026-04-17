'use client'

import { useState } from 'react'
import DraftsView from './DraftsView'
import SentView from './SentView'
import type { DraftsSnapshot } from '../_lib/loadDrafts'
import type { SentSnapshot } from '../_lib/loadSent'

/**
 * Two-pane switcher for the Invoices tab.
 *
 * - Drafts: ready-to-send invoices (status=draft)
 * - Sent:   history of everything finalized (sent/opened/paid/overdue)
 *
 * Defaults to Drafts when there are any (month-end workflow puts the
 * admin straight into the send queue). Otherwise lands on Sent so the
 * admin sees history instead of an empty page.
 */
export default function InvoicesSwitcher({
  drafts,
  sent,
}: {
  drafts: DraftsSnapshot
  sent: SentSnapshot
}) {
  const [tab, setTab] = useState<'drafts' | 'sent'>(
    drafts.drafts.length > 0 ? 'drafts' : 'sent'
  )

  const draftCount = drafts.drafts.length
  const sentCount = sent.groups.reduce((s, g) => s + g.invoices.length, 0)

  return (
    <div>
      {/* Sub-nav */}
      <div className="px-6 pt-4 border-b border-[#c4c6d1]/40 flex gap-4">
        <button
          type="button"
          onClick={() => setTab('drafts')}
          className={`
            pb-2 -mb-px text-sm font-semibold border-b-2 transition-colors
            ${tab === 'drafts'
              ? 'border-[#002058] text-[#002058]'
              : 'border-transparent text-[#444650] hover:text-[#191c1e]'
            }
          `}
        >
          Drafts{draftCount > 0 ? ` (${draftCount})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('sent')}
          className={`
            pb-2 -mb-px text-sm font-semibold border-b-2 transition-colors
            ${tab === 'sent'
              ? 'border-[#002058] text-[#002058]'
              : 'border-transparent text-[#444650] hover:text-[#191c1e]'
            }
          `}
        >
          Sent{sentCount > 0 ? ` (${sentCount})` : ''}
        </button>
      </div>

      {tab === 'drafts' ? (
        <DraftsView snapshot={drafts} />
      ) : (
        <SentView snapshot={sent} />
      )}
    </div>
  )
}
