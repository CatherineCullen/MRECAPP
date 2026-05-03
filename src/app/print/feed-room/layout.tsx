// The /print/* routes intentionally live outside /chia so they don't
// inherit the CHIA sidebar + banner layout. Each print page renders
// itself custom-built for paper — no nav, no toolbar, no chrome to
// hide. Auth still applies (the page checks getCurrentUser).
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
