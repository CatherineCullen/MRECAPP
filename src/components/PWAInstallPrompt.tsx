'use client'

import { useEffect, useState } from 'react'

// Cross-platform "Add to Home Screen" affordance.
//
// Android Chrome / Edge: the browser fires `beforeinstallprompt` we can
// intercept and trigger one-tap install on demand.
//
// iOS Safari: Apple disallows programmatic install. Best we can do is render
// step-by-step instructions ("tap Share, then Add to Home Screen"). We detect
// iOS Safari by UA + the absence of standalone display, and show a different
// CTA path.
//
// Already-installed users (display-mode: standalone) see nothing.
//
// Two visual variants:
//   - 'inline'  — always rendered, no dismiss state. Used on enrollment
//                 success where we want to push the install while engagement
//                 is highest.
//   - 'banner'  — dismissible, remembers via localStorage. Used on /my pages
//                 to nudge existing riders without nagging.

type Variant = 'inline' | 'banner'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'mrec.pwa-banner-dismissed-at'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14   // 14 days

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // Safari uses navigator.standalone; everyone else uses display-mode media.
  if ((window.navigator as { standalone?: boolean }).standalone) return true
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua)
  // Block out in-app webviews (FB, Instagram) which can't install anyway.
  const isWebView = /FBAN|FBAV|Instagram|Line\/|Twitter/.test(ua)
  return isIos && !isWebView
}

export default function PWAInstallPrompt({ variant = 'banner' }: { variant?: Variant }) {
  const [hidden, setHidden]                         = useState(true)
  const [installEvent, setInstallEvent]             = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosInstructions, setShowIosInstructions] = useState(false)

  useEffect(() => {
    if (isStandalone()) return

    if (variant === 'banner') {
      const dismissed = window.localStorage.getItem(DISMISS_KEY)
      if (dismissed && Date.now() - Number(dismissed) < DISMISS_TTL_MS) return
    }

    setHidden(false)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [variant])

  if (hidden) return null

  function dismiss() {
    if (variant === 'banner') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }
    setHidden(true)
  }

  async function handleInstall() {
    if (installEvent) {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === 'accepted') setHidden(true)
      setInstallEvent(null)
      return
    }
    if (isIosSafari()) {
      setShowIosInstructions(true)
      return
    }
    // No install signal available (e.g. desktop Firefox). Fall through to
    // showing instructions anyway — the iOS modal also reads as generic
    // "use your browser's share menu" guidance.
    setShowIosInstructions(true)
  }

  // Container styling differs per variant; CTA + instructions are shared.
  const wrapperCls = variant === 'inline'
    ? 'bg-[#dae2ff]/40 border border-[#dae2ff] rounded-lg p-4'
    : 'bg-white border border-[#c4c6d1]/40 rounded-lg p-3 flex items-center gap-3'

  return (
    <>
      <div className={wrapperCls}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#191c1e]">
            Install Marlboro Ridge on your phone
          </div>
          <div className="text-xs text-[#444650] mt-0.5">
            Add it to your home screen for one-tap access to your schedule
            and (soon) messages from your instructor.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstall}
            className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#001540] whitespace-nowrap"
          >
            {installEvent ? 'Install' : 'Show me how'}
          </button>
          {variant === 'banner' && (
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-[#444650] hover:text-[#191c1e] px-2 py-1.5"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {showIosInstructions && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIosInstructions(false)}
        >
          <div
            className="bg-white rounded-lg max-w-sm w-full p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[#191c1e]">
              Add to Home Screen
            </h3>
            <ol className="text-sm text-[#191c1e] space-y-2 list-decimal pl-5">
              <li>Tap the <strong>Share</strong> icon at the bottom of Safari (the square with the up-arrow).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
            <p className="text-xs text-[#444650]">
              The Marlboro Ridge icon will appear on your home screen. Tap it
              like any other app.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowIosInstructions(false)}
                className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#001540]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
