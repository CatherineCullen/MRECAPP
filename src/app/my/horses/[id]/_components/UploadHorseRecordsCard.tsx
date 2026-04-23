'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadHorseRecord } from '../upload-actions'

export default function UploadHorseRecordsCard({ horseId }: { horseId: string }) {
  const [open, setOpen]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTx]    = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setSuccess(null)

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File is too large (max 20 MB).')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const fd = new FormData()
    fd.append('horseId', horseId)
    fd.append('file', file)

    startTx(async () => {
      const res = await uploadHorseRecord(fd)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess(`Uploaded ${file.name}. The barn will process it shortly.`)
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div className="bg-surface-lowest rounded-lg px-4 py-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
          Upload Horse Records
        </h2>
        <span className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-on-surface">
            Send PDFs to the admin for AI-assisted import to health records.
          </p>

          <label
            className={`
              block w-full text-center cursor-pointer rounded-md
              px-3 py-2 text-sm font-semibold
              bg-surface-highest text-on-surface
              hover:bg-surface-high
              ${pending ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            {pending ? 'Uploading…' : 'Choose PDF'}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFile}
              disabled={pending}
            />
          </label>

          {error && (
            <p className="text-xs text-error">{error}</p>
          )}
          {success && (
            <p className="text-xs text-on-surface-muted">{success}</p>
          )}
        </div>
      )}
    </div>
  )
}
