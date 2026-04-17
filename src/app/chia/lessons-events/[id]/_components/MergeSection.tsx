'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { mergeLessons } from '../actions'

export type MergeCandidate = {
  id:           string
  riderNames:   string
  lessonType:   'private' | 'semi_private' | 'group'
  riderCount:   number
}

type Props = {
  targetLessonId: string
  candidates:     MergeCandidate[]
}

const TYPE_LABEL: Record<MergeCandidate['lessonType'], string> = {
  private:      'Private',
  semi_private: 'Semi-Private',
  group:        'Group',
}

export default function MergeSection({ targetLessonId, candidates }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError]          = useState<string | null>(null)
  const [scope, setScope]          = useState<'just-this' | 'quarter'>('just-this')

  if (candidates.length === 0) return null

  function handleMerge(sourceId: string) {
    setError(null)
    startTransition(async () => {
      const r = await mergeLessons({
        sourceLessonId: sourceId,
        targetLessonId,
        scope,
      })
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border border-[#c4c6d1]/40 p-4 mb-4">
      <h3 className="text-sm font-bold text-[#191c1e] mb-1">Merge with another lesson</h3>
      <p className="text-xs text-[#444650] mb-3 leading-relaxed">
        {candidates.length === 1
          ? 'Another lesson is scheduled at this exact time with the same instructor. Merging combines them into one multi-rider lesson.'
          : `${candidates.length} other lessons are scheduled at this exact time with the same instructor. Merging combines the selected one into this lesson.`}
      </p>

      {/* Scope picker */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="merge-scope"
            checked={scope === 'just-this'}
            onChange={() => setScope('just-this')}
            className="accent-[#002058]"
          />
          <span>Just this lesson</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="merge-scope"
            checked={scope === 'quarter'}
            onChange={() => setScope('quarter')}
            className="accent-[#002058]"
          />
          <span>
            All remaining lessons this quarter at this slot
            <span className="text-[10px] text-[#444650] ml-1">(same weekday, time, instructor)</span>
          </span>
        </label>
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <ul className="space-y-1.5">
        {candidates.map(c => (
          <li key={c.id} className="flex items-center justify-between border border-[#c4c6d1] rounded px-2.5 py-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded font-semibold">
                {TYPE_LABEL[c.lessonType]}
              </span>
              <span className="text-[#191c1e]">{c.riderNames || '(no riders)'}</span>
            </div>
            <button
              type="button"
              onClick={() => handleMerge(c.id)}
              disabled={pending}
              className="text-[11px] font-semibold text-[#002058] border border-[#002058]/40 px-2.5 py-1 rounded hover:bg-[#dae2ff]/40 disabled:opacity-50 transition-colors"
            >
              {pending ? 'Merging…' : 'Merge'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
