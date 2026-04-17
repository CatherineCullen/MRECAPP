'use client'

/**
 * Top bar on the print preview page. Hidden at print time via `print:hidden`
 * so it doesn't appear on the paper sheet — only serves as an on-screen
 * action while the admin is previewing.
 */
export default function PrintTriggerBar({ count }: { count: number }) {
  return (
    <div className="print:hidden sticky top-0 z-10 bg-[#f7f9fc] border-b border-[#c4c6d1]/60 px-6 py-3 flex items-center justify-between">
      <div className="text-xs text-[#444650]">
        {count} code{count === 1 ? '' : 's'} on this sheet — adjust grouping by opening multiple print views.
      </div>
      <button
        onClick={() => window.print()}
        className="bg-[#002058] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#003099]"
      >
        Print
      </button>
    </div>
  )
}
