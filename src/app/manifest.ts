import type { MetadataRoute } from 'next'

// PWA manifest — lets riders, instructors, and staff "Add to Home Screen"
// so the app behaves like a native install (full-screen, splash, icon).
// Branding here is rider-facing (Marlboro Ridge), not "CHIA" — admins access
// CHIA from inside the same shell, but the PWA identity is the barn.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Marlboro Ridge Equestrian Center',
    short_name:       'Marlboro Ridge',
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
