import { redirect } from 'next/navigation'

// Root redirects to CHIA admin panel.
// Middleware handles auth — unauthenticated users are sent to /sign-in first.
export default function Home() {
  redirect('/chia')
}
