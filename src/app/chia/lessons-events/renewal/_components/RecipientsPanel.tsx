'use client'

import { useState } from 'react'

// Renewal Recipients — v1 stub.
//
// Catherine's Phase 1 plan for renewal notices: send them from Constant
// Contact (or a similar marketing platform) or manually, NOT from CHIA's
// transactional email pipeline. The v1 contract here is therefore dead
// simple:
//
//   1. CHIA assembles the distinct billed-to recipient list (one per
//      household, de-duped across multi-kid families).
//   2. Admin clicks "Copy emails" → pastes into Constant Contact's
//      recipient field.
//   3. Admin sends from there. CHIA's job is done.
//
// Rows missing an email are flagged so admin can chase them before the
// batch goes out. Phase 2 can upgrade this to in-app send via Resend + a
// signed-token opt-out page.

type Recipient = { personId: string; name: string; email: string | null }

export default function RecipientsPanel({ recipients }: { recipients: Recipient[] }) {
  const [copied, setCopied] = useState<null | 'emails' | 'list'>(null)

  const withEmail    = recipients.filter(r => r.email)
  const withoutEmail = recipients.filter(r => !r.email)

  async function copyEmails() {
    const payload = withEmail.map(r => r.email).join(', ')
    await navigator.clipboard.writeText(payload)
    setCopied('emails')
    setTimeout(() => setCopied(c => (c === 'emails' ? null : c)), 2000)
  }

  async function copyList() {
    // Name + email one per line — handy for a quick eyeball check before
    // pasting into Constant Contact.
    const payload = withEmail.map(r => `${r.name} <${r.email}>`).join('\n')
    await navigator.clipboard.writeText(payload)
    setCopied('list')
    setTimeout(() => setCopied(c => (c === 'list' ? null : c)), 2000)
  }

  if (recipients.length === 0) return null

  return (
    <details className="bg-white rounded-lg px-4 py-3 mt-6 group">
      <summary className="text-xs font-semibold text-[#191c1e] cursor-pointer list-none flex items-center gap-2">
        <span className="text-[#8c8e98] group-open:rotate-90 transition-transform inline-block w-3">▸</span>
        Renewal Recipients ({withEmail.length} with email{withoutEmail.length > 0 ? `, ${withoutEmail.length} missing` : ''})
      </summary>

      <div className="mt-3">
        <p className="text-xs text-[#444650] mb-2">
          v1 flow: copy this list into Constant Contact (or your chosen marketing tool) to send the renewal-notice batch.
          CHIA doesn't send bulk renewal emails yet.
        </p>

        <div className="flex gap-2 mb-3">
          <button
            onClick={copyEmails}
            disabled={withEmail.length === 0}
            className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099] disabled:opacity-40"
          >
            {copied === 'emails' ? 'Copied!' : `Copy emails (${withEmail.length})`}
          </button>
          <button
            onClick={copyList}
            disabled={withEmail.length === 0}
            className="bg-white border border-[#002058] text-[#002058] text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#f0f2f6] disabled:opacity-40"
          >
            {copied === 'list' ? 'Copied!' : 'Copy names + emails'}
          </button>
        </div>

        {withoutEmail.length > 0 && (
          <div className="bg-[#fff8e5] border border-[#f0c14b] rounded-md px-3 py-2 text-xs text-[#6b4a00] mb-3">
            <strong>Missing email:</strong>{' '}
            {withoutEmail.map(r => r.name).join(', ')} — add emails in People before sending.
          </div>
        )}

        <div className="max-h-48 overflow-y-auto border border-[#ecedf2] rounded-md">
          <table className="w-full text-xs">
            <tbody>
              {recipients.map(r => (
                <tr key={r.personId} className="border-b border-[#ecedf2] last:border-b-0">
                  <td className="px-3 py-1.5 text-[#191c1e]">{r.name}</td>
                  <td className="px-3 py-1.5 text-[#444650]">
                    {r.email ?? <span className="text-[#8f3434]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}
