'use client'

import Link from 'next/link'

type Diet = {
  am_feed:        string | null
  am_supplements: string | null
  am_hay:         string | null
  pm_feed:        string | null
  pm_supplements: string | null
  pm_hay:         string | null
  notes:          string | null
  version:        number
  updated_at:     string
} | null

function DietRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm text-[#191c1e] whitespace-pre-wrap">{value}</div>
    </div>
  )
}

function TimeBlock({ label, feed, supplements, hay }: {
  label:       string
  feed:        string | null
  supplements: string | null
  hay:         string | null
}) {
  if (!feed && !supplements && !hay) return null
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider border-b border-[#f2f4f7] pb-1">
        {label}
      </div>
      <DietRow label="Feed"              value={feed} />
      <DietRow label="Supplements / Meds" value={supplements} />
      <DietRow label="Hay"               value={hay} />
    </div>
  )
}

export default function HorseDietSection({ diet, horseId }: { diet: Diet, horseId: string }) {
  return (
    <div className="border-t border-[#f2f4f7]">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Diet</span>
        <Link
          href={`/chia/herd/horses/${horseId}/diet/edit`}
          className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
        >
          {diet ? 'Edit' : '+ Add'}
        </Link>
      </div>

      {!diet ? (
        <div className="px-4 pb-3 text-sm text-[#444650]">No diet record on file.</div>
      ) : (
        <div className="px-4 pb-3 space-y-4">
          <TimeBlock
            label="AM"
            feed={diet.am_feed}
            supplements={diet.am_supplements}
            hay={diet.am_hay}
          />
          <TimeBlock
            label="PM"
            feed={diet.pm_feed}
            supplements={diet.pm_supplements}
            hay={diet.pm_hay}
          />
          {diet.notes && (
            <div>
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider border-b border-[#f2f4f7] pb-1 mb-2">Notes</div>
              <div className="text-sm text-[#444650] whitespace-pre-wrap">{diet.notes}</div>
            </div>
          )}
          {diet.updated_at && (
            <div className="text-[10px] text-[#c4c6d1]">
              Updated {new Date(diet.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {diet.version > 1 && ` · v${diet.version}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
