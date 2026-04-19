'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { runQuery, type RunQueryResult } from '../actions'
import { DISPLAY_CAP } from '../_lib/spec'

type Props = {
  prompt: string
}

export default function QueryRunner({ prompt }: Props) {
  const [specText, setSpecText]   = useState<string>('')
  const [result, setResult]       = useState<RunQueryResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [promptCopied, setPromptCopied] = useState(false)

  async function onRun() {
    setResult(null)
    startTransition(async () => {
      const r = await runQuery(specText)
      setResult(r)
    })
  }

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    })
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Step 1 — prompt */}
      <Section
        step="1"
        title="Copy the prompt"
        description={
          <>
            Paste this into a new Claude or ChatGPT conversation, then ask your question in
            plain English. The AI will produce a JSON spec you paste back in step 2. If the
            question is outside what this tool supports, the AI will tell you and point you to{' '}
            <Link href="/chia/data/extensions/direct-data-access" className="text-[#056380] font-semibold hover:underline">
              Extensions → Direct data access
            </Link>.
          </>
        }
      >
        <div className="flex items-start gap-2">
          <pre className="flex-1 bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded-lg p-3 text-[11px] font-mono text-[#191c1e] overflow-x-auto max-h-48">
{prompt.slice(0, 600)}{prompt.length > 600 ? '\n\n…  (full prompt copies to clipboard)' : ''}
          </pre>
          <button
            onClick={copyPrompt}
            className="shrink-0 bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099]"
          >
            {promptCopied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </Section>

      {/* Step 2 — paste spec + run */}
      <Section
        step="2"
        title="Paste the spec the AI gave you"
        description="The app validates against the whitelist, runs the query, and shows results below."
      >
        <textarea
          value={specText}
          onChange={e => setSpecText(e.target.value)}
          placeholder={`{\n  "table": "horse",\n  "columns": ["*"],\n  "filters": [{ "column": "status", "op": "eq", "value": "active" }],\n  "limit": 50\n}`}
          className="w-full h-48 bg-white border border-[#c4c6d1] rounded-lg p-3 text-[11px] font-mono focus:outline-none focus:border-[#002058]"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px] text-[#444650]">
            {specText.length > 0 && (
              <>{specText.length.toLocaleString()} chars</>
            )}
          </div>
          <button
            onClick={onRun}
            disabled={pending || specText.trim().length === 0}
            className="bg-[#002058] text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-[#003099] disabled:opacity-50"
          >
            {pending ? 'Running…' : 'Run query'}
          </button>
        </div>
      </Section>

      {/* Step 3 — results */}
      {result && (
        <Section
          step="3"
          title={result.ok ? 'Results' : 'Something needs attention'}
          description={result.ok
            ? `${result.rowCount.toLocaleString()} ${result.rowCount === 1 ? 'row' : 'rows'}.`
            : 'The spec didn\'t validate or the query couldn\'t run. Fix and try again, or use the escape hatch.'}
        >
          {result.ok
            ? <ResultsTable rows={result.rows} columns={result.columns} />
            : <ErrorsView errors={result.errors} />}
        </Section>
      )}
    </div>
  )
}

function Section({
  step,
  title,
  description,
  children,
}: {
  step:        string
  title:       string
  description: React.ReactNode
  children:    React.ReactNode
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
            {e.hint && (
              <div className="mt-0.5 text-[#444650] italic">{e.hint}</div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t border-[#7c4b00]/20 text-[11px] text-[#444650]">
        If the question genuinely can’t be expressed in this spec format, that’s a cue to use{' '}
        <Link href="/chia/data/extensions/direct-data-access" className="text-[#056380] font-semibold hover:underline">
          Direct data access
        </Link>. The barn owns the database — the path is always open.
      </div>
    </div>
  )
}

function ResultsTable({
  rows,
  columns,
}: {
  rows:    Record<string, unknown>[]
  columns: string[]
}) {
  if (rows.length === 0) {
    return <div className="text-xs text-[#444650] italic py-4">No rows matched.</div>
  }

  // Big results go straight to CSV — rendering thousands of rows in a plain
  // HTML table is sluggish and the admin isn't scanning row-by-row at that
  // size anyway. They're pulling data out to analyze elsewhere.
  const tooBigForScreen = rows.length > DISPLAY_CAP

  if (tooBigForScreen) {
    return (
      <div className="bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded-lg p-5 text-center">
        <div className="text-sm font-bold text-[#191c1e]">
          {rows.length.toLocaleString()} rows
        </div>
        <p className="text-xs text-[#444650] mt-1 max-w-md mx-auto">
          That{'\u2019'}s too many to render on screen usefully. Download the CSV and open it in
          Sheets, Excel, or a notebook to analyze.
        </p>
        <button
          onClick={() => downloadCSV(rows, columns)}
          className="mt-4 bg-[#002058] text-white text-xs font-semibold px-4 py-2 rounded hover:bg-[#003099]"
        >
          Download CSV ({rows.length.toLocaleString()} rows)
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => downloadCSV(rows, columns)}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058] border border-[#c4c6d1]/50 px-3 py-1 rounded"
        >
          Download CSV
        </button>
      </div>
      <div className="overflow-x-auto border border-[#c4c6d1]/40 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f2f4f7]">
              {columns.map(c => (
                <th key={c} className="text-left px-3 py-2 font-semibold text-[#444650] whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[#c4c6d1]/20 hover:bg-[#f7f9fc]">
                {columns.map(c => (
                  <td key={c} className="px-3 py-1.5 text-[#191c1e] align-top">
                    {renderCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function downloadCSV(rows: Record<string, unknown>[], columns: string[]) {
  const lines = [columns.map(csvEscape).join(',')]
  for (const r of rows) {
    lines.push(columns.map(c => csvEscape(formatForCSV(r[c]))).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `chia-query-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function formatForCSV(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function csvEscape(v: string): string {
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
