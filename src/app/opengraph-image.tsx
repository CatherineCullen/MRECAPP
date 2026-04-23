import { ImageResponse } from 'next/og'

// OpenGraph / Twitter card image served at /opengraph-image. Rendered at
// build time (or edge-cached on first request) at 1200×630, the standard
// size that Facebook, Twitter, iMessage, Slack, etc. all crop from.
//
// We render it fresh rather than shipping a static PNG so the text always
// matches the current brand string and we don't have to maintain a
// Photoshop source.

export const alt         = 'Marlboro Ridge Equestrian Center'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          '100%',
          height:         '100%',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          background:     '#1a3673', // Navy — Marlboro Ridge primary
          color:          '#dae2ff', // Sky blue secondary
          fontFamily:     'sans-serif',
          padding:        '80px',
          textAlign:      'center',
        }}
      >
        <div
          style={{
            fontSize:   84,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          Marlboro Ridge
        </div>
        <div
          style={{
            fontSize:   48,
            fontWeight: 600,
            marginTop:  16,
            letterSpacing: '0.08em',
          }}
        >
          EQUESTRIAN CENTER
        </div>
      </div>
    ),
    size,
  )
}
