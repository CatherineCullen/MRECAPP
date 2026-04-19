import DataTabs from './_components/DataTabs'

export default function DataLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-0 border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
        <h1 className="text-[#191c1e] font-bold text-lg tracking-tight mb-1">Data</h1>
        <p className="text-xs text-[#444650] mb-3 max-w-3xl">
          Your data, on your terms. Ask questions of the barn’s records in plain English and
          find ready-made specs for features the app doesn’t do natively. If the tools here
          can’t answer something, see <span className="font-semibold">Extensions → Direct data access</span>{' '}
          — the barn owns the database and the keys are yours.
        </p>
        <DataTabs />
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
