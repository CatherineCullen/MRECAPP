import { redirect } from 'next/navigation'

export default function BoardingIndex() {
  // Invoices is the daily surface: service logs, Monthly Board, ad-hoc
  // charges, allocation, and month-end generation all live there.
  redirect('/chia/boarding/invoices')
}
