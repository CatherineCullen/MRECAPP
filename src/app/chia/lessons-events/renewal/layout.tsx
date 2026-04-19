import Link from 'next/link'
import RenewalSubTabs from './_components/RenewalSubTabs'

// Shared chrome for the Renewal section — back link + sub-tab bar. Each
// child page (Roster, Invoices) brings its own heading and data load;
// keeping the layout lean avoids duplicate snapshot queries.
export default function RenewalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6">
      <Link
        href="/chia/lessons-events"
        className="text-xs text-[#444650] hover:text-[#002058] hover:underline"
      >
        ← Calendar
      </Link>
      <div className="mt-3 mb-4">
        <RenewalSubTabs />
      </div>
      {children}
    </div>
  )
}
