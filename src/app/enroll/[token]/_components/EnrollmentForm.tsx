'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SignatureCanvas from 'react-signature-canvas'
import ReactMarkdown from 'react-markdown'
import { submitEnrollment } from '../actions'
import { createClient } from '@/lib/supabase/client'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

// Public-facing enrollment form. Rider reads the waiver, fills in their own
// info, signs on the canvas, sets a password, submits. On success we sign
// them in with the just-set credentials and drop them on /my/schedule so
// they land inside the app instead of a dead-end "thanks" page.

type Prefill = {
  riderFirstName:  string
  riderLastName:   string
  riderDob:        string
  riderEmail:      string
  riderPhone:      string
  parentFirstName: string
  parentLastName:  string
  parentEmail:     string
  parentPhone:     string
}

export default function EnrollmentForm({
  token, kind, templateKind, templateBody, templateVersion,
  privacyNoticeBody, privacyNoticeVersion, prefill,
}: {
  token: string
  kind: 'adult' | 'minor'
  templateKind: 'waiver' | 'boarding_agreement'
  templateBody: string
  templateVersion: number
  privacyNoticeBody: string
  privacyNoticeVersion: number
  prefill: Prefill
}) {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [smsConsent,  setSmsConsent]  = useState(false)
  const sigRef = useRef<SignatureCanvas | null>(null)

  // Rider fields
  const [riderFirst, setRiderFirst] = useState(prefill.riderFirstName)
  const [riderLast,  setRiderLast]  = useState(prefill.riderLastName)
  const [riderDob,   setRiderDob]   = useState(prefill.riderDob)
  const [address,    setAddress]    = useState('')
  const [phone,      setPhone]      = useState(prefill.riderPhone)
  const [email,      setEmail]      = useState(prefill.riderEmail)
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

  const router = useRouter()
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
        smsConsent,
      })
      if (res.error) { setError(res.error); return }
      setDone(true)

      // Sign them in with the just-set credentials and drop them on their
      // schedule. If the silent sign-in fails for any reason, the success
      // screen stays up with a manual "Go to sign-in" fallback link.
      if (res.signInEmail) {
        const supabase = createClient()
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email:    res.signInEmail,
          password,
        })
        if (!signInErr) {
          router.push('/my/schedule')
          router.refresh()
        }
      }
    })
  }

  if (done) {
    return (
      <div className="bg-white rounded-lg p-6 text-center space-y-3">
        <div className="text-2xl">✓</div>
        <h2 className="text-lg font-bold text-[#191c1e]">Thank you — you're all set</h2>
        <p className="text-sm text-[#444650]">
          Your {templateKind === 'waiver' ? 'waiver' : 'boarding agreement'} has been recorded and your account has been created. Signing you in…
        </p>
        <p className="text-xs text-[#444650]">
          If you aren't redirected, <a href="/sign-in" className="text-[#056380] font-semibold">go to sign-in</a>.
        </p>
        <div className="pt-2 text-left">
          <PWAInstallPrompt variant="inline" />
        </div>
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
        <div className="prose prose-sm max-w-none text-[#191c1e] max-h-[420px] overflow-y-auto bg-[#f2f4f7] rounded p-4">
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

      {/* Text-message consent (TCPA — separate from privacy notice) */}
      <section className="bg-white rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[#444650] uppercase tracking-wider">
          Text messages (optional)
        </h2>
        <label className="flex items-start gap-2 text-xs text-[#191c1e]">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={e => setSmsConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I consent to receive operational text messages from Marlboro Ridge
            (lesson reminders, schedule changes, billing notices). Reply STOP
            to opt out at any time. Message and data rates may apply.
          </span>
        </label>
      </section>

      {/* Privacy notice — disclosure, not a contract; no checkbox needed */}
      <section className="bg-white rounded-lg p-5 space-y-2">
        <p className="text-xs text-[#444650]">
          By submitting, you acknowledge you have read our{' '}
          <button
            type="button"
            onClick={() => setShowPrivacy(s => !s)}
            className="text-[#056380] font-semibold underline"
          >
            Privacy Notice
          </button>
          {' '}(v{privacyNoticeVersion}).
        </p>
        {showPrivacy && (
          <div className="prose prose-sm max-w-none text-[#191c1e] max-h-[320px] overflow-y-auto bg-[#f2f4f7] rounded p-4">
            <ReactMarkdown>{privacyNoticeBody}</ReactMarkdown>
          </div>
        )}
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
