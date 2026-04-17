'use client'

import { useState } from 'react'

type Props = {
  promptBody:  string
  description: string | null
  jsonPlaceholder: string
  onParse:  (raw: string) => { ok: true; data: unknown } | { ok: false; message: string }
  children: (data: unknown, onReset: () => void) => React.ReactNode
}

type Step = 'prompt' | 'paste' | 'review'

export default function ImportFlow({ promptBody, description, jsonPlaceholder, onParse, children }: Props) {
  const [step,      setStep]      = useState<Step>('prompt')
  const [copied,    setCopied]    = useState(false)
  const [rawJson,   setRawJson]   = useState('')
  const [parseErr,  setParseErr]  = useState<string | null>(null)
  const [parsed,    setParsed]    = useState<unknown>(null)

  function handleCopy() {
    navigator.clipboard.writeText(promptBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleParse() {
    setParseErr(null)
    const result = onParse(rawJson.trim())
    if (result.ok) {
      setParsed(result.data)
      setStep('review')
    } else {
      setParseErr(result.message)
    }
  }

  function handleReset() {
    setStep('prompt')
    setRawJson('')
    setParseErr(null)
    setParsed(null)
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold text-[#444650]">
        {(['prompt', 'paste', 'review'] as Step[]).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-[#c4c6d1]">›</span>}
            <span className={step === s ? 'text-[#002058]' : ''}>
              {s === 'prompt' ? '1. Copy prompt' : s === 'paste' ? '2. Paste JSON' : '3. Review'}
            </span>
          </span>
        ))}
      </div>

      {/* Step 1: Show prompt + copy */}
      {step === 'prompt' && (
        <div className="bg-white rounded-lg overflow-hidden">
          {description && (
            <div className="px-4 py-3 bg-[#f2f4f7] text-sm text-[#444650]">{description}</div>
          )}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#444650] uppercase tracking-wider">Prompt</span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopy}
                className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
              >
                {copied ? '✓ Copied!' : 'Copy to clipboard'}
              </button>
              <button
                onClick={() => setStep('paste')}
                className="btn-primary text-white text-xs font-semibold px-3 py-1.5 rounded"
              >
                I've got the JSON →
              </button>
            </div>
          </div>
          <pre className="px-4 pb-4 text-xs text-[#444650] whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
            {promptBody}
          </pre>
        </div>
      )}

      {/* Step 2: Paste JSON */}
      {step === 'paste' && (
        <div className="bg-white rounded-lg p-4 space-y-3">
          <div className="text-sm text-[#191c1e]">
            Paste the JSON that the AI returned:
          </div>
          <textarea
            value={rawJson}
            onChange={e => setRawJson(e.target.value)}
            autoFocus
            rows={14}
            placeholder={jsonPlaceholder}
            className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-xs font-mono text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
          />
          {parseErr && (
            <div className="text-xs text-[#b00020] bg-[#ffdad6] rounded px-3 py-2">{parseErr}</div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleParse}
              disabled={!rawJson.trim()}
              className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
            >
              Parse →
            </button>
            <button onClick={() => setStep('prompt')} className="text-sm text-[#444650] hover:text-[#191c1e]">
              ← Back to prompt
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review — delegated to parent */}
      {step === 'review' && parsed !== null && (
        <div>{children(parsed, handleReset)}</div>
      )}
    </div>
  )
}
