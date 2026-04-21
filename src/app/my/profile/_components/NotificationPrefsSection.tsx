'use client'

import { useTransition } from 'react'
import { toggleNotificationPref } from '../actions'

type Pref   = { type: string; channel: 'email' | 'sms'; optedOut: boolean }
type Config = { type: string; emailEnabled: boolean; smsEnabled: boolean }

const PREFS_CONFIG = [
  { type: 'lesson_reminder',     label: 'Lesson reminders',     desc: '24 hours before your lesson' },
  { type: 'lesson_cancellation', label: 'Cancellation notices', desc: 'When a lesson is cancelled' },
]

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
        checked ? 'bg-primary-container' : 'bg-surface-highest'
      }`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
        checked ? 'left-[18px]' : 'left-0.5'
      }`} />
    </button>
  )
}

export default function NotificationPrefsSection({ prefs, config }: { prefs: Pref[]; config: Config[] }) {
  const [pending, start] = useTransition()

  function prefState(type: string, channel: 'email' | 'sms') {
    const row = prefs.find(p => p.type === type && p.channel === channel)
    return !row?.optedOut
  }

  function channelEnabled(type: string, channel: 'email' | 'sms') {
    const row = config.find(c => c.type === type)
    if (!row) return true
    return channel === 'email' ? row.emailEnabled : row.smsEnabled
  }

  function handleToggle(type: string, channel: 'email' | 'sms', currentlyOn: boolean) {
    start(async () => {
      await toggleNotificationPref(type, channel, !currentlyOn)
    })
  }

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-3">
        Notifications
      </h2>
      <div className="space-y-4">
        {PREFS_CONFIG.map(({ type, label, desc }) => {
          const emailOn      = prefState(type, 'email')
          const smsOn        = prefState(type, 'sms')
          const emailGlobal  = channelEnabled(type, 'email')
          const smsGlobal    = channelEnabled(type, 'sms')
          return (
            <div key={type}>
              <p className="text-sm font-semibold text-on-surface">{label}</p>
              <p className="text-xs text-on-surface-muted mb-2">{desc}</p>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 ${!emailGlobal ? 'opacity-50' : ''}`}>
                  <Toggle
                    checked={emailOn && emailGlobal}
                    onChange={() => handleToggle(type, 'email', emailOn)}
                    disabled={pending || !emailGlobal}
                  />
                  <span className="text-xs text-on-surface-muted">Email</span>
                </div>
                <div className={`flex items-center gap-2 ${!smsGlobal ? 'opacity-50' : ''}`}>
                  <Toggle
                    checked={smsOn && smsGlobal}
                    onChange={() => handleToggle(type, 'sms', smsOn)}
                    disabled={pending || !smsGlobal}
                  />
                  <span className="text-xs text-on-surface-muted">Text</span>
                </div>
              </div>
              {(!emailGlobal || !smsGlobal) && (
                <p className="text-[11px] text-on-surface-muted mt-1.5">
                  {!emailGlobal && !smsGlobal
                    ? 'Currently off for all riders.'
                    : !emailGlobal
                      ? 'Email is currently off for all riders.'
                      : 'Text is currently off for all riders.'}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
