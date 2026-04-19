'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { validatePayload, commitPayload, type ValidateResult, type CommitResult } from '../actions'

type Phase = 'edit' | 'validated' | 'committed'

export default function MigrateTool({ prompt }: { prompt: string }) {
  const [json, setJson]             = useState('')
  const [phase, setPhase]           = useState<Phase>('edit')
  const [validateRes, setValidate]  = useState<ValidateResult | null>(null)
  const [commitRes, setCommit]      = useState<CommitResult | null>(null)
  const [pending, startTransition]  = useTransition()
  const [promptCopied, setCopied]   = useState(false)

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function onValidate() {
    startTransition(async () => {
      const r = await validatePayload(json)
      setValidate(r)
      setPhase(r.ok ? 'validated' : 'edit')
    })
  }

  function onCommit() {
    if (!confirm('Commit this import? This will insert records into the live database. Make sure you\u2019ve reviewed the validation summary above.')) return
    startTransition(async () => {
      const r = await commitPayload(json)
      setCommit(r)
      setPhase(r.ok ? 'committed' : 'validated')
    })
  }

  function onReset() {
    setJson('')
    setValidate(null)
    setCommit(null)
    setPhase('edit')
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <Link href="/chia/herd" className="text-xs text-[#444650] hover:text-[#002058] hover:underline">
          ← Herd
        </Link>
        <h2 className="text-lg font-bold text-[#191c1e] mt-1">Bulk migrate horses &amp; people</h2>
        <p className="text-xs text-[#444650] mt-1">
          One-time import for migrating horse and owner records out of an old system. Paste a JSON
          payload matching CHIA{'\u2019'}s migration format, validate, then commit. Use the mapping prompt
          below with Claude to convert raw source data into the right shape.
        </p>
      </div>

      {/* Step 1 — mapping prompt */}
      <Section
        step="1"
        title="Mapping prompt (optional)"
        description="If your source data isn't already in CHIA's migration shape, paste the raw JSON into Claude along with this prompt to convert it."
      >
        <div className="flex items-start gap-2">
          <pre className="flex-1 bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded-lg p-3 text-[11px] font-mono text-[#191c1e] overflow-x-auto max-h-48">
{prompt.slice(0, 600)}{prompt.length > 600 ? '\n\n\u2026  (full prompt copies to clipboard)' : ''}
          </pre>
          <button
            onClick={copyPrompt}
            className="shrink-0 bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099]"
          >
            {promptCopied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </Section>

      {/* Step 2 — paste payload */}
      <Section
        step="2"
        title="Paste migration JSON"
        description="Must be an object with &quot;people&quot; and &quot;horses&quot; arrays. People carry a _ref slug; horse contacts reference people by person_ref."
      >
        <textarea
          value={json}
          onChange={e => {
            setJson(e.target.value)
            if (phase !== 'edit') { setPhase('edit'); setValidate(null); setCommit(null) }
          }}
          placeholder={`{\n  "people": [\n    { "_ref": "jane-smith", "first_name": "Jane", "last_name": "Smith", "roles": ["owner"] }\n  ],\n  "horses": [\n    { "barn_name": "Biscuit", "status": "active",\n      "contacts": [{ "person_ref": "jane-smith", "role": "Owner", "is_billing_contact": true }] }\n  ]\n}`}
          className="w-full h-72 bg-white border border-[#c4c6d1] rounded-lg p-3 text-[11px] font-mono focus:outline-none focus:border-[#002058]"
          disabled={phase === 'committed'}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px] text-[#444650]">
            {json.length > 0 && <>{json.length.toLocaleString()} chars</>}
          </div>
          <div className="flex gap-2">
            {phase === 'committed' && (
              <button
                onClick={onReset}
                className="bg-[#f2f4f7] text-[#002058] text-xs font-semibold px-4 py-1.5 rounded hover:bg-[#e4e6ec]"
              >
                Start another import
              </button>
            )}
            {phase !== 'committed' && (
              <button
                onClick={onValidate}
                disabled={pending || json.trim().length === 0}
                className="bg-[#f2f4f7] text-[#002058] text-xs font-semibold px-4 py-1.5 rounded hover:bg-[#e4e6ec] disabled:opacity-50"
              >
                {pending && !validateRes ? 'Validating\u2026' : 'Dry run / validate'}
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Step 3 — validation result */}
      {validateRes && phase !== 'committed' && (
        <Section
          step="3"
          title={validateRes.ok ? 'Validated — ready to commit' : 'Validation errors'}
          description={validateRes.ok
            ? 'Payload is structurally valid and cross-references resolve. Review the counts and commit when ready.'
            : 'Fix the issues below and re-validate.'}
        >
          {validateRes.ok
            ? (
              <div className="space-y-4">
                <div className="bg-[#e8f4f7] border border-[#056380]/20 rounded-lg p-4 text-xs">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <Stat label="People"   value={validateRes.summary.peopleCount} />
                    <Stat label="Horses"   value={validateRes.summary.horsesCount} />
                    <Stat label="Contacts" value={validateRes.summary.contactsCount} />
                    <Stat label="Roles"    value={validateRes.summary.rolesCount} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={onCommit}
                    disabled={pending}
                    className="bg-[#002058] text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-[#003099] disabled:opacity-50"
                  >
                    {pending ? 'Committing\u2026' : 'Commit import'}
                  </button>
                </div>
              </div>
            )
            : <ErrorsView errors={validateRes.errors} />}
        </Section>
      )}

      {/* Step 4 — commit result */}
      {commitRes && (
        <Section
          step="4"
          title={commitRes.ok ? 'Imported' : 'Commit failed'}
          description={commitRes.ok
            ? 'Records inserted. Check Herd and People to confirm, then decide if you\u2019re running another batch.'
            : 'Some records may have been inserted before the failure \u2014 read the error carefully.'}
        >
          {commitRes.ok
            ? (
              <div className="bg-[#dcedc8]/40 border border-[#558b2f]/30 rounded-lg p-4 text-xs">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <Stat label="People inserted"   value={commitRes.inserted.people} />
                  <Stat label="Horses inserted"   value={commitRes.inserted.horses} />
                  <Stat label="Contacts inserted" value={commitRes.inserted.contacts} />
                  <Stat label="Roles inserted"    value={commitRes.inserted.roles} />
                </div>
                <div className="mt-4 flex gap-2 justify-end">
                  <Link href="/chia/herd" className="text-xs font-semibold text-[#002058] hover:underline px-3 py-1">
                    Go to Herd
                  </Link>
                  <Link href="/chia/people" className="text-xs font-semibold text-[#002058] hover:underline px-3 py-1">
                    Go to People
                  </Link>
                </div>
              </div>
            )
            : <ErrorsView errors={commitRes.errors} />}
        </Section>
      )}
    </div>
  )
}

function Section({
  step, title, description, children,
}: {
  step: string; title: string; description: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <div className="mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold text-[#056380] uppercase tracking-wider">Step {step}</span>
          <h3 className="text-sm font-bold text-[#191c1e]">{title}</h3>
        </div>
        <p className="text-xs text-[#444650] mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-bold text-[#191c1e]">{value.toLocaleString()}</div>
      <div className="text-[10px] text-[#444650] uppercase tracking-wider">{label}</div>
    </div>
  )
}

function ErrorsView({ errors }: { errors: { path: string; message: string; hint?: string }[] }) {
  return (
    <div className="bg-[#ffddb3]/30 border border-[#7c4b00]/20 rounded-lg p-4">
      <ul className="space-y-2.5">
        {errors.map((e, i) => (
          <li key={i} className="text-xs">
            <div className="text-[#191c1e]">
              <span className="font-mono font-semibold text-[#7c4b00]">{e.path}</span>
              <span className="ml-2">{e.message}</span>
            </div>
            {e.hint && <div className="mt-0.5 text-[#444650] italic">{e.hint}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
