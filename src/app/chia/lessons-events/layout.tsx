import LessonsEventsTabs from './_components/LessonsEventsTabs'

export default function LessonsEventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-0 border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
        <h1 className="text-[#191c1e] font-bold text-lg tracking-tight mb-3">Lessons &amp; Events</h1>
        <LessonsEventsTabs />
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
