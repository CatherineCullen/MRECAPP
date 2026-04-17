'use client'

import { useState } from 'react'

/**
 * Tiny copy-to-clipboard button for QR scan URLs. We don't show the URL string
 * in the table — it's long and noisy — the button just copies silently.
 */
export default function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-xs font-semibold text-[#002058] px-2 py-0.5 rounded hover:bg-[#dae2ff]/40"
    >
      {copied ? 'Copied' : 'Copy URL'}
    </button>
  )
}
