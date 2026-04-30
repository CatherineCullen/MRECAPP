import type { MetadataRoute } from 'next'

// PWA manifest — lets riders, instructors, and staff "Add to Home Screen"
// so the app behaves like a native install (full-screen, splash, icon).
// Branding here is rider-facing (Marlboro Ridge Equestrian Center),
// not "CHIA" — admins access CHIA from inside the same shell, but the
// PWA identity is the barn.
//
// CRITICAL: short_name is "MREC", never "Marlboro Ridge". Home-screen
// launchers truncate long names, and "Marlboro Ridge Equestrian Center"
// would truncate to "Marlboro Ridge" — which is the name of the local
// HOA and creates real confusion. MREC is the existing acronym (used in
// the repo name and rider-facing emails) and is short enough to never
// truncate.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Marlboro Ridge Equestrian Center',
    short_name:       'MREC',
    description:      'Lessons, boarding, and training at Marlboro Ridge Equestrian Center.',
    start_url:        '/',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#ffffff',
    theme_color:      '#002058',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
