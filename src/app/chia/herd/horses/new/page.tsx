import Link from 'next/link'
import AddHorseForm from './_components/AddHorseForm'

export default function NewHorsePage() {
  return (
    <div className="p-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-5">
        <Link href="/chia/herd/horses" className="text-[#056380] hover:text-[#002058]">
          Horses
        </Link>
        <span className="text-[#c4c6d1]">/</span>
        <span className="text-[#191c1e] font-semibold">Add Horse</span>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 bg-[#f2f4f7]">
          <h2 className="text-sm font-bold text-[#191c1e]">Add Horse</h2>
        </div>
        <AddHorseForm />
      </div>
    </div>
  )
}
