import ConfigurationTabs from './_components/ConfigurationTabs'

export default function ConfigurationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4 pb-0 border-b border-[#c4c6d1]/30 bg-[#f7f9fc]">
        <ConfigurationTabs />
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
