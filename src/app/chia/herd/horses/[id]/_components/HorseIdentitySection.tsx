'use client'

import { useState } from 'react'

export default function HorseIdentitySection({ horse, recordingIds }: { horse: any, recordingIds: any }) {
  const [expanded, setExpanded] = useState(false)
  const [showRecordingIds, setShowRecordingIds] = useState(false)

  const fields = [
    { label: 'Breed',     value: horse.breed },
    { label: 'Gender',    value: horse.gender },
    { label: 'Color',     value: horse.color },
    { label: 'Height',    value: horse.height ? `${horse.height} hh` : null },
    { label: 'Weight',    value: horse.weight ? `${horse.weight} lbs` : null },
    { label: 'DOB',       value: horse.date_of_birth },
    { label: 'Microchip', value: horse.microchip },
  ]

  const hasRecordingIds = recordingIds && (
    recordingIds.usef_id || recordingIds.breed_recording_number ||
    recordingIds.passport_number
  )

  return (
    <section className="bg-white rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#f2f4f7] text-left"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[#191c1e]">{horse.barn_name}</h2>
          {horse.lesson_horse && (
            <span className="text-[10px] font-semibold bg-[#dae2ff] text-[#002058] px-1.5 py-0.5 rounded uppercase tracking-wider">
              Lesson horse
            </span>
          )}
          {horse.solo_turnout && (
            <span className="text-[10px] font-semibold bg-[#ffddb3] text-[#7c4b00] px-1.5 py-0.5 rounded uppercase tracking-wider">
              Solo turnout
            </span>
          )}
          {horse.charges_monthly_board === false && (
            <span className="text-[10px] font-semibold bg-[#e8edf4] text-[#444650] px-1.5 py-0.5 rounded uppercase tracking-wider" title="Monthly board is not auto-billed for this horse.">
              No monthly board
            </span>
          )}
          {horse.registered_name && horse.registered_name !== horse.barn_name && (
            <span className="text-xs text-[#444650]">{horse.registered_name}</span>
          )}
        </div>
        <span className="text-[#444650] text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Core fields grid */}
          <div className="grid grid-cols-4 gap-x-6 gap-y-2">
            {fields.map(({ label, value }) => value ? (
              <div key={label}>
                <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">{label}</div>
                <div className="text-sm text-[#191c1e] font-medium">{value}</div>
              </div>
            ) : null)}
          </div>

          {/* Notes */}
          {horse.notes && (
            <div>
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Notes</div>
              <div className="text-sm text-[#444650]">{horse.notes}</div>
            </div>
          )}

          {/* Turnout notes */}
          {horse.turnout_notes && (
            <div>
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Turnout</div>
              <div className="text-sm text-[#444650]">{horse.turnout_notes}</div>
            </div>
          )}

          {/* Ownership notes */}
          {horse.ownership_notes && (
            <div>
              <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider mb-0.5">Ownership</div>
              <div className="text-sm text-[#444650]">{horse.ownership_notes}</div>
            </div>
          )}

          {/* Recording / Registration IDs — collapsed by default */}
          {hasRecordingIds && (
            <div>
              <button
                onClick={() => setShowRecordingIds(!showRecordingIds)}
                className="text-xs font-semibold text-[#056380] hover:text-[#002058]"
              >
                {showRecordingIds ? '▲ Hide' : '▼ Show'} recording / registration IDs
              </button>
              {showRecordingIds && (
                <div className="mt-2 grid grid-cols-3 gap-x-6 gap-y-2">
                  {recordingIds.usef_id && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">USEF ID</div>
                      <div className="text-sm text-[#191c1e]">{recordingIds.usef_id}</div>
                    </div>
                  )}
                  {recordingIds.breed_recording_number && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Breed Recording</div>
                      <div className="text-sm text-[#191c1e]">{recordingIds.breed_recording_number}</div>
                    </div>
                  )}
                  {recordingIds.passport_number && (
                    <div>
                      <div className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider">Passport</div>
                      <div className="text-sm text-[#191c1e]">{recordingIds.passport_number}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
