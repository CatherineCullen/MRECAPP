'use client'

import { useState } from 'react'
import CogginsImport from './CogginsImport'
import VetRecordImport from './VetRecordImport'

type PromptData = { slug: string; label: string; description: string | null; body: string }
type HorseOption = { id: string; barn_name: string; registered_name?: string | null }
export type CatalogEntry = { id: string; name: string; is_essential: boolean }

type Tab = 'coggins' | 'vet_record'

const TABS: { id: Tab; label: string }[] = [
  { id: 'coggins',    label: 'Coggins'    },
  { id: 'vet_record', label: 'Vet Record' },
]

export default function ImportTools({
  cogginsPrompt,
  vetRecordPrompt,
  horses,
  catalog,
  initialHorseId,
  initialTab = 'coggins',
  initialMode = 'manual',
}: {
  cogginsPrompt:   PromptData | null
  vetRecordPrompt: PromptData | null
  horses:          HorseOption[]
  catalog:         CatalogEntry[]
  initialHorseId:  string | null
  initialTab?:     Tab
  initialMode?:    'manual' | 'ai'
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  return (
    <div className="max-w-3xl">
      {/* Tab strip */}
      <div className="flex items-center gap-1 bg-[#f2f4f7] rounded p-0.5 mb-5 w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`
              px-4 py-1.5 text-xs font-semibold rounded transition-colors
              ${activeTab === id
                ? 'bg-white text-[#002058] shadow-sm'
                : 'text-[#444650] hover:text-[#191c1e]'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'coggins' && (
        cogginsPrompt
          ? <CogginsImport prompt={cogginsPrompt} horses={horses} initialHorseId={initialHorseId} initialMode={initialMode} />
          : <div className="text-sm text-[#444650]">Coggins import prompt not configured.</div>
      )}
      {activeTab === 'vet_record' && (
        vetRecordPrompt
          ? <VetRecordImport prompt={vetRecordPrompt} horses={horses} catalog={catalog} initialHorseId={initialHorseId} initialMode={initialMode} />
          : <div className="text-sm text-[#444650]">Vet record import prompt not configured.</div>
      )}
    </div>
  )
}
