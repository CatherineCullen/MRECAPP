'use client'

import { useRef, useState, useTransition } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import ReactMarkdown from 'react-markdown'
import { submitEnrollment } from '../actions'

// Public-facing enrollment form. Rider reads the waiver, fills in their own
// info, signs on the canvas, sets a password, submits. On success the page
// swaps to a "done" state — we do NOT redirect them anywhere (the rider
// app doesn't exist yet; there's nowhere to send them).

type Prefill = {
  riderFirstName:  string
  riderLastName:   string
  riderDob:        string
  parentFirstName: string
  parentLastName:  string
  parentEmail:     string
  parentPhone:     string
}

export default function EnrollmentForm({
  token, kind, templateKind, templateBody, templateVersion, prefill,
}: {
  token: string
  kind: 'adult' | 'minor'
  templateKind: 'waiver' | 'boarding_agreement'
  templateBody: string
  templateVersion: number
  prefill: Prefill
}) {
  const sigRef = useRef<SignatureCanvas | null>(null)

  // Rider fields
  const [riderFirst, setRiderFirst] = useState(prefill.riderFirstName)
  const [riderLast,  setRiderLast]  = useState(prefill.riderLastName)
  const [riderDob,   setRiderDob]   = useState(prefill.riderDob)
  const [address,    setAddress]    = useState('')
  const [phone,      setPhone]      = useState('')
  const [email,      setEmail]      = useState('')
  const [emgName,    setEmgName]    = useState('')
  const [emgPhone,   setEmgPhone]   = useState('')

  // Parent fields (minor only)
  const [parentFirst, setParentFirst] = useState(prefill.parentFirstName)
  const [parentLast,  setParentLast]  = useState(prefill.parentLastName)
  const [parentEmail, setParentEmail] = useState(prefill.parentEmail)
  const [parentPhone, setParentPhone] = useState(prefill.parentPhone)

  // Account
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [agreed, setAgreed] = useState(false)

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState(false)

  function clearSig() { sigRef.current?.clear() }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!agreed) { setError('Please check the box to confirm you have read and agree.'); return }
    if (password !== password2) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!sigRef.current || sigRef.current.isEmpty()) { setError('Please sign before submitting.'); return }

    const signaturePngDataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')

    startTransition(async () => {
      const res = await submitEnrollment({
        token,
        riderFirstName: riderFirst,
        riderLastName:  riderLast,
        riderDob:       riderDob || null,
        address:        address  || null,
        phone:          phone    || null,
        email:          email    || null,
        emergencyName:  emgName  || null,
        emergencyPhone: emgPhone || null,
        parentFirstName: kind === 'minor' ? parentFirst : undefined,
        parentLastName:  kind === 'minor' ? parentLast  : undefined,
        parentEmail:     kind === 'minor' ? parentEmail : undefined,
        parentPhone:     kind === 'minor' ? parentPhone : undefined,
        password,
        signaturePngDataUrl,
      })
      if (res.error) { setError(res.error); return }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="bg-white rounded-lg p-6 text-center space-y-3">
        <div className="text-2xl">✓</div>
        <h2 className="text-lg font-bold text-[#191c1e]">Thank you — you're all set</h2>
        <p className="text-sm text-[#444650]">
          Your {templateKind === 'waiver' ? 'waiver' : 'boarding agreement'} has been recorded and your account has been created.
          The barn will be in touch with next steps. You can close this window.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Agreement text */}
      <section className="bg-white rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#444650] uppercase tracking-wider mb-2">
          Please read carefully (v{templateVersion})
        </h2>
        <div className="prose prose-sm max-w-none text-[#191c1e] max-h-[420px] overflow-y-auto border border-[#e0e3e6] rounded p-3 bg-[#fafbfd]">
          <ReactMarkdown>{templateBody}</ReactMarkdown>
        </div>
      </section>

      {/* Rider info */}
      <section className="bg-white rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#444650] uppercase tracking-wider">
          {kind === 'minor' ? 'Rider (child)' : 'Your information'}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *" value={riderFirst} onChange={setRiderFirst} required />
          <Field label="Last name *"  value={riderLast}  onChange={setRiderLast}  required />
          <Field label="Date of birth" value={riderDob}  onChange={setRiderDob}  type="date" />
          <Field label="Address" value={address} onChange={setAddress} className="col-span-1" />
          {kind === 'adult' && (
            <>
              <Field label="Phone *" value={phone} onChange={setPhone} type="tel" required />
              <Field label="Email *" value={email} onChange={setEmail} type="email" required />
            </>
          )}
          <Field label="Emergency contact name *" value={emgName}  onChange={setEmgName}  required />
          <Field label="Emergency phone *"         value={emgPhone} onChange={setEmgPhone} type="tel" required />
        </div>
      </section>

      {/* Parent info (minor only) */}
      {kind === 'minor' && (
        <section className="bg-white rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#444650] uppercase tracking-wider">
            Parent / Guardian (account holder)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name *" value={parentFirst} onChange={setParentFirst} required />
            <Field label="Last name *"  value={parentLast}  onChange={setParentLast}  required />
            <Field label="Email *"      value={parentEmail} onChange={setParentEmail} type="email" required />
            <Field label="Phone *"      value={parentPhone} onChange={setParentPhone} type="tel"   required />
          </div>
        </section>
      )}

      {/* Signature */}
      <section className="bg-white rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[#444650] uppercase tracking-wider">
          Signature {kind === 'minor' && <span className="font-normal">(parent / guardian)</span>}
        </h2>
        <div className="border border-[#c4c6d1] rounded bg-[#fafbfd]">
          <SignatureCanvas
            ref={sigRef}
            canvasProps={{ className: 'w-full h-40 rounded' }}
            penColor="#191c1e"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-[#444650]">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            I have read and agree to the terms above.
          </label>
          <button
            type="button"
            onClick={clearSig}
            className="text-xs text-[#056380] hover:text-[#002058]"
          >
            Clear signature
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="bg-white rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#444650] uppercase tracking-wider">
          Create your password
        </h2>
        <p className="text-xs text-[#444650]">
          You'll use this to sign in once the barn's app is live — minimum 8 characters.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password *"         value={password}  onChange={setPassword}  type="password" required />
          <Field label="Confirm password *" value={password2} onChange={setPassword2} type="password" required />
        </div>
      </section>

      {error && (
        <div className="bg-[#fce8e6] border border-[#f5c2be] rounded p-3 text-sm text-[#b3261e]">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="bg-[#002058] hover:bg-[#001540] text-white font-semibold text-sm px-6 py-3 rounded disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : 'Submit & create account'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label, value, onChange, type = 'text', required = false, className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
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
