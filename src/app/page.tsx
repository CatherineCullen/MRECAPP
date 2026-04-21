import { redirect } from 'next/navigation'

// Root always routes to the mobile-facing surface — it's the entry point
// most people hit by typing the URL or tapping a link. Admins bookmark
// /chia (or click through from /my) on desktop.
// Middleware handles auth — unauthenticated users are sent to /sign-in first.
export default function Home() {
  redirect('/my/schedule')
}
