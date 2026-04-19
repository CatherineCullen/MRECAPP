export default function SavedQueriesPage() {
  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-sm font-bold text-[#191c1e]">Saved Queries</h2>
      <p className="text-xs text-[#444650] mt-1">
        After you run a question through AI Query, name it and save it here to re-run with one
        click. Empty at launch by design — the library grows from the questions that actually
        matter.
      </p>
      <div className="mt-6 bg-[#f7f9fc] border border-[#c4c6d1]/50 rounded-lg p-4 text-xs text-[#444650] italic">
        No saved queries yet. Run something useful in AI Query first, then come back and save it.
      </div>
    </div>
  )
}
