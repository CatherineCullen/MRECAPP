'use client'

import { useState, useTransition } from 'react'
import { createInvite } from '@/app/chia/documents/_lib/enrollmentActions'

type Mode = 'adult' | 'minor'
type TemplateKind = 'waiver' | 'boarding_agreement'

// returnTo is validated upstream — only same-origin /chia/* paths reach here.
// We append ?newRiderId=… so the origin form can refetch its rider list and
// auto-select the just-created rider, saving the admin the "refresh to find
// them" shuffle.
export default function InviteRiderForm({
  returnTo,
  returnLabel,
}: {
  returnTo?: string | null
  returnLabel?: string | null
}) {
  const [mode, setMode] = useState<Mode>('adult')
  const [templateKind, setTemplateKind] = useState<TemplateKind>('waiver')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ link: string; token: string; riderPersonId: string } | null>(null)

  // Adult fields
  const [aFirst, setAFirst] = useState(''); const [aLast, setALast] = useState('')
  const [aEmail, setAEmail] = useState(''); const [aPhone, setAPhone] = useState('')

  // Minor fields
  const [pFirst, setPFirst] = useState(''); const [pLast, setPLast] = useState('')
  const [pEmail, setPEmail] = useState(''); const [pPhone, setPPhone] = useState('')
  const [cFirst, setCFirst] = useState(''); const [cLast, setCLast] = useState('')
  const [cDob, setCDob]     = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = mode === 'adult'
        ? await createInvite({
            kind: 'adult', templateKind,
            firstName: aFirst, lastName: aLast,
            email: aEmail || null, phone: aPhone || null,
          })
        : await createInvite({
            kind: 'minor', templateKind,
            parentFirstName: pFirst, parentLastName: pLast,
            parentEmail: pEmail || null, parentPhone: pPhone || null,
            childFirstName: cFirst, childLastName: cLast,
            childDob: cDob || null,
          })
      if (res.error) { setError(res.error); return }
      if (res.link && res.token && res.riderPersonId) {
        setResult({ link: res.link, token: res.token, riderPersonId: res.riderPersonId })
      }
    })
  }

  function copyLink() {
    if (!result) return
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    navigator.clipboard.writeText(`${origin}${result.link}`).catch(() => {})
  }

  if (result) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    // If the admin came from a scheduling form, drop them back with the new
    // rider's id in the query string so the form can pre-select them. Join
    // character picked based on whether returnTo already has a query string.
    const backHref = returnTo
      ? `${returnTo}${returnTo.includes('?') ? '&' : '?'}newRiderId=${encodeURIComponent(result.riderPersonId)}`
      : null
    return (
      <div className="bg-white rounded-lg p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-1">Invite created</div>
          <p className="text-sm text-[#191c1e]">
            Stub Person{mode === 'minor' ? 's' : ''} created.
            Copy this link and send it to the {mode === 'minor' ? 'parent' : 'rider'}. It expires in 30 days and is single-use.
          </p>
        </div>
        <div className="bg-[#f2f4f7] border border-[#c4c6d1]/40 rounded p-3">
          <code className="text-xs text-[#191c1e] break-all">{origin}{result.link}</code>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={copyLink}
            className="btn-primary text-white text-xs font-semibold px-4 py-2 rounded"
          >
            Copy link
          </button>
          {backHref ? (
            <a
              href={backHref}
              className="text-xs font-semibold text-white bg-[#056380] hover:bg-[#002058] px-4 py-2 rounded"
            >
              ← Back to {returnLabel}
            </a>
          ) : (
            <a
              href="/chia/people"
              className="text-xs font-semibold text-[#056380] hover:text-[#002058] px-4 py-2 rounded border border-[#c4c6d1]/50"
            >
              Done
            </a>
          )}
          <button
            onClick={() => { setResult(null); setError(null) }}
            className="text-xs font-semibold text-[#444650] hover:text-[#191c1e] px-4 py-2 rounded ml-auto"
          >
            Invite another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg p-5 space-y-5">
      {/* Rider age */}
      <div>
        <div className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">Rider age</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('adult')}
            className={`px-3 py-2 text-sm rounded border ${
              mode === 'adult'
                ? 'border-[#002058] bg-[#e8edf4] text-[#002058] font-semibold'
                : 'border-[#c4c6d1] text-[#444650]'
            }`}
          >
            Adult (18+)
          </button>
          <button
            type="button"
            onClick={() => setMode('minor')}
            className={`px-3 py-2 text-sm rounded border ${
              mode === 'minor'
                ? 'border-[#002058] bg-[#e8edf4] text-[#002058] font-semibold'
                : 'border-[#c4c6d1] text-[#444650]'
            }`}
          >
            Minor (under 18 — parent signs)
          </button>
        </div>
      </div>

      {/* Template type */}
      <div>
        <label className="block text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">Document</label>
        <select
          value={templateKind}
          onChange={e => setTemplateKind(e.target.value as TemplateKind)}
          className="border border-[#c4c6d1] rounded px-2 py-1.5 text-sm w-64"
        >
          <option value="waiver">Waiver (lesson riders)</option>
          <option value="boarding_agreement">Boarding Agreement (boarders)</option>
        </select>
      </div>

      {mode === 'adult' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *" value={aFirst} onChange={setAFirst} required />
          <Field label="Last name *"  value={aLast}  onChange={setALast}  required />
          <Field label="Email"        value={aEmail} onChange={setAEmail} type="email" />
          <Field label="Phone"        value={aPhone} onChange={setAPhone} type="tel" />
        </div>
      ) : (
        <>
          <div>
            <div className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">Parent / Guardian (account holder)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name *" value={pFirst} onChange={setPFirst} required />
              <Field label="Last name *"  value={pLast}  onChange={setPLast}  required />
              <Field label="Email"        value={pEmail} onChange={setPEmail} type="email" />
              <Field label="Phone"        value={pPhone} onChange={setPPhone} type="tel" />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#444650] uppercase tracking-wider mb-2">Child (rider)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name *" value={cFirst} onChange={setCFirst} required />
              <Field label="Last name *"  value={cLast}  onChange={setCLast}  required />
              <Field label="Date of birth" value={cDob}  onChange={setCDob}  type="date" />
            </div>
          </div>
        </>
      )}

      {error && <div className="text-xs text-[#b3261e]">{error}</div>}

      <div className="flex justify-end gap-2 pt-2">
        <a
          href="/chia/people"
          className="text-xs font-semibold text-[#444650] hover:text-[#191c1e] px-4 py-2 rounded"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary text-white text-xs font-semibold px-4 py-2 rounded disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create invite link'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label, value, onChange, type = 'text', required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#444650] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full border border-[#c4c6d1] rounded px-2 py-1.5 text-sm"
      />
    </div>
  )
}
