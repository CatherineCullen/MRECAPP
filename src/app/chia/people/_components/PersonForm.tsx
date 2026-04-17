'use client'

import { useActionState, useState } from 'react'

const ALL_ROLES = [
  { value: 'rider',            label: 'Rider' },
  { value: 'boarder',          label: 'Boarder' },
  { value: 'instructor',       label: 'Instructor' },
  { value: 'barn_worker',      label: 'Barn Worker' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'admin',            label: 'Admin' },
  { value: 'barn_owner',       label: 'Barn Owner' },
]

type PersonData = {
  first_name?:               string | null
  last_name?:                string | null
  preferred_name?:           string | null
  email?:                    string | null
  phone?:                    string | null
  address?:                  string | null
  date_of_birth?:            string | null
  is_minor?:                 boolean
  guardian_id?:              string | null
  is_organization?:          boolean
  organization_name?:        string | null
  provider_type?:            string | null
  is_training_ride_provider?: boolean
  riding_level?:             string | null
  weight_category?:          string | null
  height?:                   string | null
  usef_id?:                  string | null
  notes?:                    string | null
  preferred_language?:       string | null
  person_role?:              { role: string; deleted_at?: string | null }[]
}

type GuardianOption = { id: string; first_name: string; last_name: string; is_minor: boolean }

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
    </button>
  )
}

export default function PersonForm({
  action,
  cancelHref,
  person,
  people,
  submitLabel = 'Save Person',
}: {
  action:       (formData: FormData) => Promise<void>
  cancelHref:   string
  person?:      PersonData
  people:       GuardianOption[]
  submitLabel?: string
}) {
  // Only ACTIVE (non-soft-deleted) roles should appear pre-checked
  const existingRoles = (person?.person_role ?? [])
    .filter(r => !r.deleted_at)
    .map(r => r.role)
  const [selectedRoles, setSelectedRoles] = useState<string[]>(existingRoles)
  const [isOrg,   setIsOrg]   = useState(person?.is_organization  ?? false)
  const [isMinor, setIsMinor] = useState(person?.is_minor ?? false)

  const [, formAction, pending] = useActionState(
    async (_prev: null, formData: FormData) => {
      // Inject selected roles into form data
      selectedRoles.forEach(r => formData.append('roles', r))
      await action(formData)
      return null
    },
    null
  )

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const dobValue = person?.date_of_birth ? (person.date_of_birth as string).substring(0, 10) : ''

  return (
    <form action={formAction} className="px-5 py-4 space-y-5">

      {/* ── Type flags ── */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isOrg}
            onChange={e => { setIsOrg(e.target.checked); if (e.target.checked) setIsMinor(false) }}
            name="is_organization"
            className="w-4 h-4 accent-[#002058]"
          />
          <span className="text-sm text-[#191c1e]">Organization / LLC</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isMinor}
            onChange={e => { setIsMinor(e.target.checked); if (e.target.checked) setIsOrg(false) }}
            name="is_minor"
            className="w-4 h-4 accent-[#002058]"
          />
          <span className="text-sm text-[#191c1e]">Minor (no login)</span>
        </label>
      </div>

      {/* ── Identity ── */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Identity</legend>

        {isOrg ? (
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">
              Organization Name <span className="text-[#b00020]">*</span>
            </label>
            <input
              name="organization_name"
              required
              defaultValue={person?.organization_name ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">
                First Name <span className="text-[#b00020]">*</span>
              </label>
              <input
                name="first_name"
                required={!isOrg}
                autoFocus
                defaultValue={person?.first_name ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">
                Last Name <span className="text-[#b00020]">*</span>
              </label>
              <input
                name="last_name"
                required={!isOrg}
                defaultValue={person?.last_name ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">Preferred Name / Goes by</label>
              <input
                name="preferred_name"
                defaultValue={person?.preferred_name ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">Date of Birth</label>
              <input
                name="date_of_birth"
                type="date"
                defaultValue={dobValue}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
          </div>
        )}

        {/* Guardian picker for minors */}
        {isMinor && (
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">
              Guardian <span className="text-[#b00020]">*</span>
            </label>
            <select
              name="guardian_id"
              required={isMinor}
              defaultValue={person?.guardian_id ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
            >
              <option value="">Select guardian…</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {/* ── Contact ── */}
      <fieldset className="space-y-3">
        <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Contact</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={person?.email ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Phone</label>
            <input
              name="phone"
              type="tel"
              defaultValue={person?.phone ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-[#444650] mb-1">Address</label>
            <textarea
              name="address"
              rows={2}
              defaultValue={person?.address ?? ''}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#444650] mb-1">Preferred Language</label>
            <select
              name="preferred_language"
              defaultValue={person?.preferred_language ?? 'english'}
              className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* ── Roles ── */}
      {!isOrg && (
        <fieldset className="space-y-2">
          <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Roles</legend>
          <div className="flex items-center gap-2 flex-wrap">
            {ALL_ROLES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleRole(value)}
                className={`
                  text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
                  ${selectedRoles.includes(value)
                    ? 'bg-[#002058] text-white border-[#002058]'
                    : 'bg-white text-[#444650] border-[#c4c6d1] hover:border-[#002058]'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* ── Admin fields ── */}
      {!isOrg && (
        <fieldset className="space-y-3">
          <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Admin Fields</legend>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">Riding Level</label>
              <select
                name="riding_level"
                defaultValue={person?.riding_level ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
              >
                <option value="">—</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">Weight Category</label>
              <select
                name="weight_category"
                defaultValue={person?.weight_category ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] bg-white"
              >
                <option value="">—</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="heavy">Heavy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">Height</label>
              <input
                name="height"
                placeholder="e.g. 5'6&quot;"
                defaultValue={person?.height ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">USEF ID</label>
              <input
                name="usef_id"
                defaultValue={person?.usef_id ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#444650] mb-1">Provider Type</label>
              <input
                name="provider_type"
                placeholder="e.g. Farrier, Vet"
                defaultValue={person?.provider_type ?? ''}
                className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380]"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              name="is_training_ride_provider"
              type="checkbox"
              defaultChecked={person?.is_training_ride_provider ?? false}
              className="w-4 h-4 accent-[#002058]"
            />
            <span className="text-sm text-[#191c1e]">Training ride provider</span>
          </label>
        </fieldset>
      )}

      {/* ── Notes ── */}
      <fieldset>
        <legend className="text-[10px] font-semibold text-[#444650] uppercase tracking-wider pb-1">Notes</legend>
        <textarea
          name="notes"
          rows={3}
          defaultValue={person?.notes ?? ''}
          className="w-full border border-[#c4c6d1] rounded px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:border-[#056380] resize-y"
        />
      </fieldset>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pending={pending} label={submitLabel} />
        <a href={cancelHref} className="text-sm text-[#444650] hover:text-[#191c1e]">Cancel</a>
      </div>
    </form>
  )
}
