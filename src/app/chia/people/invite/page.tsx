import Link from 'next/link'
import InviteRiderForm from './_components/InviteRiderForm'

// Admin-only wrapper page for the Invite Rider flow. The CHIA layout already
// guards /chia/* against non-admins; this page inherits that.
//
// Supports optional ?returnTo=<path>&returnLabel=<label> query params so an
// invite triggered from a scheduling form (New Lesson, New Subscription,
// New Event) can render a "Back to <label>" button on the success screen.
// Only same-origin, /chia-prefixed paths are accepted — prevents an invite
// link from being weaponized as an open-redirect.

function sanitizeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/chia/')) return null
  if (raw.includes('//')) return null
  return raw
}

export default async function InviteRiderPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; returnLabel?: string }>
}) {
  const sp = await searchParams
  const returnTo = sanitizeReturnTo(sp.returnTo)
  const returnLabel = returnTo ? (sp.returnLabel?.slice(0, 40) ?? 'where you came from') : null

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/people" className="text-[#056380] hover:text-[#002058]">People</Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Invite Rider</span>
      </div>

      <div className="mb-4">
        <h1 className="text-lg font-bold text-[#191c1e]">Invite Rider</h1>
        <p className="text-xs text-[#444650] mt-1 leading-relaxed">
          Creates a stub Person (or two, for a minor) and generates a one-time enrollment link.
          Hand the link to the rider or guardian — they'll fill in their own info, sign the waiver,
          and set a password. Link is valid for 30 days, single use.
        </p>
      </div>

      <InviteRiderForm returnTo={returnTo} returnLabel={returnLabel} />
    </div>
  )
}
